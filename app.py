import json
import os
from datetime import date

from flask import Flask, jsonify, render_template, request

from jalali import (
    PERSIAN_MONTH_NAMES,
    gregorian_to_jalali,
    jalali_month_length,
    jalali_to_gregorian,
    persian_weekday,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "db.json")
QUOTES_PATH = os.path.join(BASE_DIR, "data", "quotes.json")

app = Flask(__name__)


# ---------------------------------------------------------------- storage --
def load_db():
    with open(DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_db(db):
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def today_str():
    return date.today().isoformat()


def recompute_today(db):
    """Recalculate today's average progress snapshot + bump today's activity count."""
    tasks = db["tasks"]
    avg = round(sum(t["progress"] for t in tasks) / len(tasks), 1) if tasks else 0.0
    today = today_str()

    for entry in db["history"]:
        if entry["date"] == today:
            entry["avg_progress"] = avg
            break
    else:
        db["history"].append({"date": today, "avg_progress": avg})

    db["activity"][today] = db["activity"].get(today, 0) + 1


# -------------------------------------------------------------------- page --
@app.route("/")
def index():
    return render_template("index.html")


# --------------------------------------------------------------- tasks api --
@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    db = load_db()
    tasks = sorted(db["tasks"], key=lambda t: t["id"], reverse=True)
    return jsonify(tasks)


@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "عنوان کار الزامی است"}), 400

    db = load_db()
    task = {
        "id": db["next_id"],
        "title": title,
        "description": (data.get("description") or "").strip(),
        "category": (data.get("category") or "عمومی").strip(),
        "due_date": data.get("due_date") or None,
        "progress": 0,
        "prev_progress": None,
        "created_at": today_str(),
        "completed_at": None,
    }
    db["next_id"] += 1
    db["tasks"].append(task)
    recompute_today(db)
    save_db(db)
    return jsonify(task), 201


@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task(task_id):
    data = request.get_json(force=True) or {}
    db = load_db()
    task = next((t for t in db["tasks"] if t["id"] == task_id), None)
    if not task:
        return jsonify({"error": "کار پیدا نشد"}), 404

    for field in ("title", "description", "category", "due_date"):
        if field in data:
            task[field] = data[field]

    if data.get("toggle_done"):
        if task["progress"] < 100:
            task["prev_progress"] = task["progress"]
            task["progress"] = 100
            task["completed_at"] = today_str()
        else:
            task["progress"] = task.get("prev_progress") or 0
            task["prev_progress"] = None
            task["completed_at"] = None
    elif "progress" in data:
        try:
            progress = max(0, min(100, int(data["progress"])))
        except (TypeError, ValueError):
            return jsonify({"error": "مقدار پیشرفت نامعتبر است"}), 400
        task["progress"] = progress
        task["completed_at"] = today_str() if progress == 100 else None
        if progress < 100:
            task["prev_progress"] = None

    recompute_today(db)
    save_db(db)
    return jsonify(task)


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    db = load_db()
    before = len(db["tasks"])
    db["tasks"] = [t for t in db["tasks"] if t["id"] != task_id]
    if len(db["tasks"]) == before:
        return jsonify({"error": "کار پیدا نشد"}), 404
    recompute_today(db)
    save_db(db)
    return jsonify({"ok": True})


# ------------------------------------------------------------ calendar api --
@app.route("/api/today")
def api_today():
    g = date.today()
    jy, jm, jd = gregorian_to_jalali(g.year, g.month, g.day)
    return jsonify({"jy": jy, "jm": jm, "jd": jd})


@app.route("/api/calendar")
def calendar_view():
    try:
        jy = int(request.args.get("jy"))
        jm = int(request.args.get("jm"))
    except (TypeError, ValueError):
        return jsonify({"error": "پارامتر ماه/سال نامعتبر است"}), 400
    if jm < 1 or jm > 12:
        return jsonify({"error": "ماه نامعتبر است"}), 400

    db = load_db()
    length = jalali_month_length(jy, jm)

    today_g = date.today()
    tjy, tjm, tjd = gregorian_to_jalali(today_g.year, today_g.month, today_g.day)

    days = []
    for jd in range(1, length + 1):
        gy, gm, gd = jalali_to_gregorian(jy, jm, jd)
        iso = date(gy, gm, gd).isoformat()
        days.append(
            {
                "jd": jd,
                "weekday": persian_weekday(date(gy, gm, gd).weekday()),
                "activity": db["activity"].get(iso, 0),
                "iso": iso,
                "is_today": (jy, jm, jd) == (tjy, tjm, tjd),
            }
        )

    return jsonify(
        {
            "jy": jy,
            "jm": jm,
            "month_name": PERSIAN_MONTH_NAMES[jm - 1],
            "length": length,
            "start_weekday": days[0]["weekday"] if days else 0,
            "days": days,
        }
    )


# ------------------------------------------------------------ progress api --
@app.route("/api/progress")
def progress_view():
    db = load_db()
    tasks = [
        {"id": t["id"], "title": t["title"], "progress": t["progress"], "category": t["category"]}
        for t in db["tasks"]
    ]
    history = sorted(db["history"], key=lambda x: x["date"])[-45:]
    current_avg = (
        round(sum(t["progress"] for t in db["tasks"]) / len(db["tasks"]), 1) if db["tasks"] else 0.0
    )
    done = sum(1 for t in db["tasks"] if t["progress"] == 100)
    return jsonify(
        {
            "tasks": tasks,
            "history": history,
            "current_avg": current_avg,
            "total_tasks": len(db["tasks"]),
            "done_tasks": done,
        }
    )


# --------------------------------------------------------------- quote api --
@app.route("/api/quote")
def quote_view():
    with open(QUOTES_PATH, "r", encoding="utf-8") as f:
        quotes = json.load(f)
    idx = date.today().toordinal() % len(quotes)
    return jsonify({"quote": quotes[idx]})


if __name__ == "__main__":
    app.run(debug=True)

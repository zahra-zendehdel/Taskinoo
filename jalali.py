"""
تبدیل تاریخ میلادی <-> شمسی (جلالی) بدون نیاز به کتابخانه‌ی خارجی.
الگوریتم استاندارد و شناخته‌شده‌ی تقویم جلالی.
"""
from datetime import date, timedelta

_J_DAYS_IN_MONTH = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]

PERSIAN_MONTH_NAMES = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]

PERSIAN_WEEKDAY_NAMES = ["شنبه", "یک‌شنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"]
PERSIAN_WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"]


def gregorian_to_jalali(gy, gm, gd):
    g_days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gy2 = gy - 1600
    gm2 = gm - 1
    gd2 = gd - 1

    g_day_no = 365 * gy2 + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400
    for i in range(gm2):
        g_day_no += g_days_in_month[i]
    if gm2 > 1 and ((gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0):
        g_day_no += 1
    g_day_no += gd2

    j_day_no = g_day_no - 79
    j_np = j_day_no // 12053
    j_day_no %= 12053

    jy = 979 + 33 * j_np + 4 * (j_day_no // 1461)
    j_day_no %= 1461

    if j_day_no >= 366:
        jy += (j_day_no - 1) // 365
        j_day_no = (j_day_no - 1) % 365

    jm = 12
    jd = None
    for i in range(11):
        if j_day_no < _J_DAYS_IN_MONTH[i]:
            jm = i + 1
            jd = j_day_no + 1
            break
        j_day_no -= _J_DAYS_IN_MONTH[i]
    if jd is None:
        jd = j_day_no + 1

    return jy, jm, jd


def jalali_to_gregorian(jy, jm, jd):
    jy2 = jy - 979
    jm2 = jm - 1
    jd2 = jd - 1

    j_day_no = 365 * jy2 + (jy2 // 33) * 8 + ((jy2 % 33) + 3) // 4
    for i in range(jm2):
        j_day_no += _J_DAYS_IN_MONTH[i]
    j_day_no += jd2

    g_day_no = j_day_no + 79

    gy = 1600 + 400 * (g_day_no // 146097)
    g_day_no %= 146097

    leap = True
    if g_day_no >= 36525:
        g_day_no -= 1
        gy += 100 * (g_day_no // 36524)
        g_day_no %= 36524
        if g_day_no >= 365:
            g_day_no += 1
        else:
            leap = False

    gy += 4 * (g_day_no // 1461)
    g_day_no %= 1461

    if g_day_no >= 366:
        leap = False
        g_day_no -= 1
        gy += g_day_no // 365
        g_day_no %= 365

    g_days_in_month = [31, 29 if ((gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0) else 28,
                        31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 0
    while gm < 12 and g_day_no >= g_days_in_month[gm]:
        g_day_no -= g_days_in_month[gm]
        gm += 1
    gm += 1
    gd = g_day_no + 1

    return gy, gm, gd


def jalali_month_length(jy, jm):
    """Robust month length by round-tripping through Gregorian dates."""
    if jm <= 11:
        next_jy, next_jm = jy, jm + 1
    else:
        next_jy, next_jm = jy + 1, 1
    gy, gm, gd = jalali_to_gregorian(next_jy, next_jm, 1)
    first_of_next = date(gy, gm, gd)
    last_day = first_of_next - timedelta(days=1)
    _, _, jd = gregorian_to_jalali(last_day.year, last_day.month, last_day.day)
    return jd


def persian_weekday(python_weekday):
    """python_weekday: Monday=0 ... Sunday=6 -> Persian week index Saturday=0 ... Friday=6"""
    return (python_weekday + 2) % 7

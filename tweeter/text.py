def generate_tweet(
    t1_last_hour,
    t1_now,
    t1_next_hour,
    t1_in_2_hours,
    t1_in_3_hours,
    t2_last_hour,
    t2_now,
    t2_next_hour,
    t2_in_2_hours,
    t2_in_3_hours,
):
    def fm(m):
        return f"{m}m"

    def pct(a, b):
        if a == 0:
            return None
        return round(((b - a) / a) * 100)

    def sig(p, diff):
        if p is None:
            return False
        return abs(p) >= 5 and abs(diff) >= 1

    t1_pct_3h = pct(t1_now, t1_in_3_hours)
    t2_pct_3h = pct(t2_now, t2_in_3_hours)

    t1_worst = max(t1_next_hour, t1_in_2_hours, t1_in_3_hours)
    t2_worst = max(t2_next_hour, t2_in_2_hours, t2_in_3_hours)

    t1_up = t1_now <= t1_next_hour <= t1_in_2_hours <= t1_in_3_hours
    t2_up = t2_now <= t2_next_hour <= t2_in_2_hours <= t2_in_3_hours
    t1_down = t1_now >= t1_next_hour >= t1_in_2_hours >= t1_in_3_hours
    t2_down = t2_now >= t2_next_hour >= t2_in_2_hours >= t2_in_3_hours

    t1_crit = t1_now >= 45 or t1_worst >= 45
    t2_crit = t2_now >= 45 or t2_worst >= 45

    t1_great = t1_now <= 5 and t1_worst <= 8
    t2_great = t2_now <= 5 and t2_worst <= 8

    flat = (
        not sig(pct(t1_now, t1_next_hour), t1_next_hour - t1_now)
        and not sig(t1_pct_3h, t1_in_3_hours - t1_now)
        and not sig(pct(t2_now, t2_next_hour), t2_next_hour - t2_now)
        and not sig(t2_pct_3h, t2_in_3_hours - t2_now)
    )

    better = None
    if t1_now < t2_now:
        better = "T1"
    elif t2_now < t1_now:
        better = "T2"

    lines = []

    if t1_crit and t2_crit:
        lines.append(f"⚠️ DUB security: long waits ahead")
        lines.append(f"T1: {fm(t1_now)} now, up to {fm(t1_worst)}")
        lines.append(f"T2: {fm(t2_now)} now, up to {fm(t2_worst)}")
        if better:
            lines.append(f"{better} shorter right now")
    elif t1_crit:
        lines.append(f"⚠️ T1 could hit {fm(t1_worst)} — T2 at {fm(t2_now)}")
        lines.append(f"T2 is the better bet right now")
    elif t2_crit:
        lines.append(f"⚠️ T2 could hit {fm(t2_worst)} — T1 at {fm(t1_now)}")
        lines.append(f"T1 is the better bet right now")
    elif t1_great and t2_great:
        lines.append(f"🟢 DUB security flying — T1: {fm(t1_now)}, T2: {fm(t2_now)}")
        lines.append(f"Staying low for the next 3hrs")
    elif flat:
        lines.append(f"⏱️ DUB security steady — T1: {fm(t1_now)}, T2: {fm(t2_now)}")
        lines.append(f"No big changes expected")
    elif t1_up and t2_up:
        lines.append(f"📈 DUB security rising")
        lines.append(f"T1: {fm(t1_now)} → {fm(t1_in_3_hours)}")
        lines.append(f"T2: {fm(t2_now)} → {fm(t2_in_3_hours)}")
    elif t1_down and t2_down:
        lines.append(f"📉 DUB security clearing")
        lines.append(f"T1: {fm(t1_now)} → {fm(t1_in_3_hours)}")
        lines.append(f"T2: {fm(t2_now)} → {fm(t2_in_3_hours)}")
    elif t1_up and t2_down:
        lines.append(f"📈 T1 rising, T2 clearing")
        lines.append(f"T1: {fm(t1_now)} → {fm(t1_in_3_hours)}")
        lines.append(f"T2: {fm(t2_now)} → {fm(t2_in_3_hours)}")
        lines.append(f"T2 is the pick")
    elif t2_up and t1_down:
        lines.append(f"📈 T2 rising, T1 clearing")
        lines.append(f"T1: {fm(t1_now)} → {fm(t1_in_3_hours)}")
        lines.append(f"T2: {fm(t2_now)} → {fm(t2_in_3_hours)}")
        lines.append(f"T1 is the pick")
    else:
        lines.append(f"⏱️ DUB security update")
        lines.append(f"T1: {fm(t1_now)} now → {fm(t1_in_3_hours)} in 3hrs")
        lines.append(f"T2: {fm(t2_now)} now → {fm(t2_in_3_hours)} in 3hrs")
        if better and abs(t1_now - t2_now) >= 5:
            lines.append(f"{better} quicker right now")

    tweet = "\n".join(lines)

    if len(tweet) > 270:
        tweet = tweet[:267] + "..."

    return tweet

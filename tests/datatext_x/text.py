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
    t1 = [t1_last_hour, t1_now, t1_next_hour, t1_in_2_hours, t1_in_3_hours]
    t2 = [t2_last_hour, t2_now, t2_next_hour, t2_in_2_hours, t2_in_3_hours]

    labels = ["last hour", "now", "in 1hr", "in 2hrs", "in 3hrs"]
    future_labels = ["in 1hr", "in 2hrs", "in 3hrs"]

    def pct(a, b):
        if a == 0:
            return None
        return round(((b - a) / a) * 100)

    def direction(a, b, threshold=5):
        if b is None:
            return "stable"
        if b > threshold:
            return "rise"
        elif b < -threshold:
            return "fall"
        return "stable"

    def fmt_min(m):
        return f"{m} min" if m == 1 else f"{m} mins"

    def fmt_pct(p):
        return f"{abs(p)}%"

    def peak_index(values):
        return values.index(max(values))

    def trough_index(values):
        return values.index(min(values))

    def trend_word(p):
        if p is None:
            return "changing"
        a = abs(p)
        if a >= 100:
            return "doubling" if p > 0 else "halving"
        if a >= 50:
            return "surging" if p > 0 else "plummeting"
        if a >= 25:
            return "rising sharply" if p > 0 else "falling sharply"
        if a >= 10:
            return "rising" if p > 0 else "falling"
        if a >= 5:
            return "creeping up" if p > 0 else "easing"
        return "holding steady"

    def significant(p, abs_diff, min_pct=5, min_abs=1):
        if p is None:
            return False
        return abs(p) >= min_pct and abs_diff >= min_abs

    t1_future = t1[1:]
    t2_future = t2[1:]

    t1_pct_1h = pct(t1_now, t1_next_hour)
    t1_pct_2h = pct(t1_now, t1_in_2_hours)
    t1_pct_3h = pct(t1_now, t1_in_3_hours)

    t2_pct_1h = pct(t2_now, t2_next_hour)
    t2_pct_2h = pct(t2_now, t2_in_2_hours)
    t2_pct_3h = pct(t2_now, t2_in_3_hours)

    t1_worst_future_val = max(t1[2:])
    t2_worst_future_val = max(t2[2:])
    t1_worst_future_idx = t1[2:].index(t1_worst_future_val) + 2
    t2_worst_future_idx = t2[2:].index(t2_worst_future_val) + 2

    t1_best_future_val = min(t1[2:])
    t2_best_future_val = min(t2[2:])
    t1_best_future_idx = t1[2:].index(t1_best_future_val) + 2
    t2_best_future_idx = t2[2:].index(t2_best_future_val) + 2

    t1_past_trend = pct(t1_last_hour, t1_now)
    t2_past_trend = pct(t2_last_hour, t2_now)

    t1_end_pct = t1_pct_3h
    t2_end_pct = t2_pct_3h

    t1_sig_2h = significant(t1_pct_2h, abs(t1_in_2_hours - t1_now))
    t2_sig_2h = significant(t2_pct_2h, abs(t2_in_2_hours - t2_now))
    t1_sig_3h = significant(t1_pct_3h, abs(t1_in_3_hours - t1_now))
    t2_sig_3h = significant(t2_pct_3h, abs(t2_in_3_hours - t2_now))

    all_flat = (
        not t1_sig_2h
        and not t1_sig_3h
        and not t2_sig_2h
        and not t2_sig_3h
        and not significant(t1_pct_1h, abs(t1_next_hour - t1_now))
        and not significant(t2_pct_1h, abs(t2_next_hour - t2_now))
    )

    t1_spike_then_drop = (
        t1_worst_future_idx < 4
        and t1_in_3_hours < t1_worst_future_val
        and significant(pct(t1_now, t1_worst_future_val), t1_worst_future_val - t1_now)
    )
    t2_spike_then_drop = (
        t2_worst_future_idx < 4
        and t2_in_3_hours < t2_worst_future_val
        and significant(pct(t2_now, t2_worst_future_val), t2_worst_future_val - t2_now)
    )

    t1_dip_then_rise = (
        t1_best_future_idx < 4
        and t1_in_3_hours > t1_best_future_val
        and significant(pct(t1_now, t1_best_future_val), t1_now - t1_best_future_val)
    )
    t2_dip_then_rise = (
        t2_best_future_idx < 4
        and t2_in_3_hours > t2_best_future_val
        and significant(pct(t2_now, t2_best_future_val), t2_now - t2_best_future_val)
    )

    t1_monotone_up = all(t1[i] <= t1[i + 1] for i in range(1, 4))
    t2_monotone_up = all(t2[i] <= t2[i + 1] for i in range(1, 4))
    t1_monotone_down = all(t1[i] >= t1[i + 1] for i in range(1, 4))
    t2_monotone_down = all(t2[i] >= t2[i + 1] for i in range(1, 4))

    t1_critical = t1_now >= 45 or t1_worst_future_val >= 45
    t2_critical = t2_now >= 45 or t2_worst_future_val >= 45

    t1_great = t1_now <= 5 and t1_worst_future_val <= 8
    t2_great = t2_now <= 5 and t2_worst_future_val <= 8

    t1_better_now = t1_now < t2_now
    t1_worse_now = t1_now > t2_now
    same_now = t1_now == t2_now

    gap_now = abs(t1_now - t2_now)
    better_terminal_now = (
        "T1" if t1_now < t2_now else ("T2" if t2_now < t1_now else None)
    )
    worse_terminal_now = (
        "T2" if t1_now < t2_now else ("T1" if t2_now < t1_now else None)
    )

    t1_diverging = (
        t1_pct_3h is not None
        and t2_pct_3h is not None
        and (
            (t1_pct_3h > 10 and t2_pct_3h < -10) or (t1_pct_3h < -10 and t2_pct_3h > 10)
        )
    )

    t1_converging = (
        t1_pct_3h is not None
        and t2_pct_3h is not None
        and gap_now >= 5
        and abs(t1_in_3_hours - t2_in_3_hours) < gap_now * 0.4
    )

    emoji_up = "📈"
    emoji_down = "📉"
    emoji_clock = "⏱️"
    emoji_plane = "✈️"
    emoji_warn = "⚠️"
    emoji_fire = "🔥"
    emoji_green = "🟢"
    emoji_red = "🔴"
    emoji_yellow = "🟡"

    lines = []

    if t1_critical or t2_critical:
        if t1_critical and t2_critical:
            worst = max(t1_worst_future_val, t2_worst_future_val)
            lines.append(f"{emoji_warn} Long queues ahead at Dublin Airport security.")
            lines.append(
                f"T1: up to {fmt_min(t1_worst_future_val)} | T2: up to {fmt_min(t2_worst_future_val)} {emoji_clock}"
            )
            if better_terminal_now:
                lines.append(
                    f"If you can choose — {better_terminal_now} is shorter right now ({fmt_min(min(t1_now, t2_now))})."
                )
        else:
            crit_t = "T1" if t1_critical else "T2"
            crit_val = t1_worst_future_val if t1_critical else t2_worst_future_val
            ok_t = "T2" if t1_critical else "T1"
            ok_val = t2_now if t1_critical else t1_now
            lines.append(
                f"{emoji_warn} Terminal {crit_t[-1]} security at Dublin Airport could hit {fmt_min(crit_val)}."
            )
            lines.append(
                f"Terminal {ok_t[-1]} is much calmer at {fmt_min(ok_val)} right now. {emoji_green}"
            )

    elif t1_great and t2_great:
        lines.append(
            f"{emoji_green} Great news — security at Dublin Airport is flying through."
        )
        lines.append(
            f"T1: {fmt_min(t1_now)} | T2: {fmt_min(t2_now)} and both look steady for the next 3 hours. {emoji_plane}"
        )

    elif all_flat:
        if same_now:
            lines.append(f"{emoji_clock} Security times at Dublin Airport are stable.")
            lines.append(
                f"Both T1 and T2 holding at {fmt_min(t1_now)} with no major changes predicted."
            )
        else:
            lines.append(f"{emoji_clock} Steady conditions at Dublin Airport security.")
            lines.append(
                f"T1: {fmt_min(t1_now)} | T2: {fmt_min(t2_now)} — no significant changes expected. {emoji_plane}"
            )

    elif t1_diverging:
        if t1_pct_3h > 0:
            lines.append(
                f"{emoji_up} T1 and T2 are heading in opposite directions at Dublin Airport."
            )
            lines.append(
                f"T1 {trend_word(t1_pct_3h)} to {fmt_min(t1_in_3_hours)} while T2 eases to {fmt_min(t2_in_3_hours)} {emoji_down}"
            )
            lines.append(f"T2 looks like the smarter pick right now. {emoji_green}")
        else:
            lines.append(
                f"{emoji_down} T1 and T2 diverging at Dublin Airport security."
            )
            lines.append(
                f"T1 easing to {fmt_min(t1_in_3_hours)} {emoji_green} while T2 climbs to {fmt_min(t2_in_3_hours)} {emoji_up}"
            )
            lines.append(f"T1 is your best bet if you have the option.")

    elif t1_spike_then_drop and t2_spike_then_drop:
        spike_label = future_labels[max(t1_worst_future_idx, t2_worst_future_idx) - 2]
        lines.append(
            f"{emoji_warn} Busy window ahead at Dublin Airport — both terminals peaking {future_labels[t1_worst_future_idx - 2]}."
        )
        lines.append(
            f"T1 could hit {fmt_min(t1_worst_future_val)}, T2 up to {fmt_min(t2_worst_future_val)}. Eases after. {emoji_clock}"
        )

    elif t1_spike_then_drop and not t2_spike_then_drop:
        lines.append(
            f"{emoji_warn} T1 security at Dublin Airport spikes {future_labels[t1_worst_future_idx - 2]} — up to {fmt_min(t1_worst_future_val)}."
        )
        lines.append(
            f"T2 is more consistent at {fmt_min(t2_now)}. Consider your options. {emoji_clock}"
        )

    elif t2_spike_then_drop and not t1_spike_then_drop:
        lines.append(
            f"{emoji_warn} T2 security at Dublin Airport spikes {future_labels[t2_worst_future_idx - 2]} — up to {fmt_min(t2_worst_future_val)}."
        )
        lines.append(
            f"T1 is more consistent at {fmt_min(t1_now)}. Worth bearing in mind. {emoji_clock}"
        )

    elif t1_monotone_up and t2_monotone_up:
        dominant_pct = (
            t1_pct_3h if abs(t1_pct_3h or 0) >= abs(t2_pct_3h or 0) else t2_pct_3h
        )
        lines.append(
            f"{emoji_up} Security times at Dublin Airport are climbing steadily across both terminals."
        )
        if t1_sig_3h and t2_sig_3h:
            lines.append(
                f"T1: {fmt_min(t1_now)} → {fmt_min(t1_in_3_hours)} ({fmt_pct(t1_pct_3h)} rise) | T2: {fmt_min(t2_now)} → {fmt_min(t2_in_3_hours)} ({fmt_pct(t2_pct_3h)} rise) {emoji_clock}"
            )
        elif t1_sig_3h:
            lines.append(
                f"T1 {trend_word(t1_pct_3h)} to {fmt_min(t1_in_3_hours)} over 3hrs. T2 holding steadier at {fmt_min(t2_in_3_hours)}. {emoji_clock}"
            )
        else:
            lines.append(
                f"T2 {trend_word(t2_pct_3h)} to {fmt_min(t2_in_3_hours)} over 3hrs. T1 holding steadier at {fmt_min(t1_in_3_hours)}. {emoji_clock}"
            )

    elif t1_monotone_down and t2_monotone_down:
        lines.append(
            f"{emoji_down} Good news — security times at Dublin Airport are easing at both terminals."
        )
        if t1_sig_3h and t2_sig_3h:
            lines.append(
                f"T1: {fmt_min(t1_now)} → {fmt_min(t1_in_3_hours)} | T2: {fmt_min(t2_now)} → {fmt_min(t2_in_3_hours)} over the next 3hrs. {emoji_green}"
            )
        else:
            lines.append(
                f"T1: {fmt_min(t1_now)} | T2: {fmt_min(t2_now)} — both trending down. {emoji_green}"
            )

    elif t1_monotone_up and not t2_monotone_up:
        if t2_monotone_down:
            lines.append(
                f"{emoji_up} T1 security rising at Dublin Airport while T2 is clearing. {emoji_down}"
            )
            lines.append(
                f"T1 heading to {fmt_min(t1_in_3_hours)}, T2 dropping to {fmt_min(t2_in_3_hours)} — T2 looks the better call."
            )
        else:
            lines.append(
                f"{emoji_up} T1 security at Dublin Airport is {trend_word(t1_pct_3h)} to {fmt_min(t1_in_3_hours)}."
            )
            lines.append(
                f"T2 more variable — currently {fmt_min(t2_now)}, predicted {fmt_min(t2_in_3_hours)} in 3hrs. {emoji_clock}"
            )

    elif t2_monotone_up and not t1_monotone_up:
        if t1_monotone_down:
            lines.append(
                f"{emoji_up} T2 security rising at Dublin Airport while T1 is clearing. {emoji_down}"
            )
            lines.append(
                f"T2 heading to {fmt_min(t2_in_3_hours)}, T1 dropping to {fmt_min(t1_in_3_hours)} — T1 is the better pick."
            )
        else:
            lines.append(
                f"{emoji_up} T2 security at Dublin Airport is {trend_word(t2_pct_3h)} to {fmt_min(t2_in_3_hours)}."
            )
            lines.append(
                f"T1 more variable — currently {fmt_min(t1_now)}, predicted {fmt_min(t1_in_3_hours)} in 3hrs. {emoji_clock}"
            )

    elif t1_monotone_down and not t2_monotone_down:
        lines.append(
            f"{emoji_down} T1 security is easing at Dublin Airport — down to {fmt_min(t1_in_3_hours)} in 3hrs."
        )
        lines.append(
            f"T2 more mixed — currently {fmt_min(t2_now)}, peaking at {fmt_min(t2_worst_future_val)} {future_labels[t2_worst_future_idx - 2]}. {emoji_clock}"
        )

    elif t2_monotone_down and not t1_monotone_down:
        lines.append(
            f"{emoji_down} T2 security is easing at Dublin Airport — down to {fmt_min(t2_in_3_hours)} in 3hrs."
        )
        lines.append(
            f"T1 more mixed — currently {fmt_min(t1_now)}, peaking at {fmt_min(t1_worst_future_val)} {future_labels[t1_worst_future_idx - 2]}. {emoji_clock}"
        )

    else:
        if t1_sig_2h or t1_sig_3h or t2_sig_2h or t2_sig_3h:
            big_t1 = t1_pct_3h if t1_sig_3h else t1_pct_2h
            big_t2 = t2_pct_3h if t2_sig_3h else t2_pct_2h
            if abs(big_t1 or 0) >= abs(big_t2 or 0):
                lead_icon = emoji_up if (big_t1 or 0) > 0 else emoji_down
                lines.append(
                    f"{lead_icon} T1 security at Dublin Airport expected to {trend_word(big_t1)} to {fmt_min(t1_in_3_hours)} over the next 3hrs."
                )
                lines.append(
                    f"T2 currently {fmt_min(t2_now)}, forecast {fmt_min(t2_in_3_hours)}. {emoji_clock}"
                )
            else:
                lead_icon = emoji_up if (big_t2 or 0) > 0 else emoji_down
                lines.append(
                    f"{lead_icon} T2 security at Dublin Airport expected to {trend_word(big_t2)} to {fmt_min(t2_in_3_hours)} over the next 3hrs."
                )
                lines.append(
                    f"T1 currently {fmt_min(t1_now)}, forecast {fmt_min(t1_in_3_hours)}. {emoji_clock}"
                )
        else:
            lines.append(
                f"{emoji_clock} Security times at Dublin Airport are relatively stable."
            )
            lines.append(
                f"T1: {fmt_min(t1_now)} | T2: {fmt_min(t2_now)} with no major swings predicted in the next 3 hours. {emoji_plane}"
            )

    past_surge_t1 = t1_past_trend is not None and t1_past_trend >= 30 and t1_now >= 15
    past_surge_t2 = t2_past_trend is not None and t2_past_trend >= 30 and t2_now >= 15

    if past_surge_t1 and past_surge_t2:
        lines.append(
            f"Both terminals have already surged in the last hour — plan ahead."
        )
    elif past_surge_t1:
        lines.append(
            f"T1 has already jumped {fmt_pct(t1_past_trend)} in the last hour."
        )
    elif past_surge_t2:
        lines.append(
            f"T2 has already jumped {fmt_pct(t2_past_trend)} in the last hour."
        )

    if t1_converging and not t1_diverging:
        lines.append(
            f"Both terminals converging — gap narrowing to ~{abs(t1_in_3_hours - t2_in_3_hours)} mins in 3hrs."
        )

    if (
        gap_now >= 10
        and not t1_critical
        and not t2_critical
        and not any(
            "smarter" in l or "better" in l or "best" in l or "call" in l for l in lines
        )
    ):
        better = "T1" if t1_now < t2_now else "T2"
        better_val = min(t1_now, t2_now)
        lines.append(
            f"Right now, {better} is the quicker option at {fmt_min(better_val)}."
        )

    tweet = " ".join(lines)

    if len(tweet) > 280:
        tweet = tweet[:277] + "..."

    return tweet


if __name__ == "__main__":
    examples = [
        (10, 12, 20, 35, 30, 8, 9, 10, 11, 12),
        (5, 4, 3, 2, 2, 5, 4, 3, 3, 2),
        (8, 8, 8, 9, 8, 7, 7, 8, 7, 7),
        (20, 30, 50, 45, 35, 10, 12, 10, 8, 7),
        (60, 70, 80, 85, 90, 55, 60, 70, 75, 80),
        (3, 3, 4, 3, 4, 3, 3, 3, 4, 3),
        (10, 15, 30, 15, 10, 10, 14, 28, 14, 9),
        (5, 5, 5, 5, 5, 30, 25, 20, 15, 10),
        (40, 50, 30, 20, 15, 10, 12, 40, 60, 70),
        (15, 20, 25, 30, 35, 35, 30, 25, 20, 15),
    ]

    descriptions = [
        "T1 spikes, T2 flat",
        "Both falling",
        "All flat",
        "T1 spikes then drops, T2 eases",
        "Both critical",
        "Tiny variation only",
        "Both spike then drop",
        "T1 tiny, T2 falling",
        "Mixed diverging",
        "Converging from opposite directions",
    ]

    for desc, args in zip(descriptions, examples):
        tweet = generate_tweet(*args)
        print(f"\n[{desc}]")
        print(tweet)
        print(f"({len(tweet)} chars)")

from viz import plot_security_times

img_bytes = plot_security_times(
    t1_last_hour=12,
    t1_now=18,
    t1_next_hour=22,
    t1_in_2_hours=15,
    t1_in_3_hours=10,
    t2_last_hour=8,
    t2_now=14,
    t2_next_hour=20,
    t2_in_2_hours=25,
    t2_in_3_hours=18,
)

with open("my_graph.png", "wb") as f:
    f.write(img_bytes)
print(f"Got {len(img_bytes)} bytes, saved to my_graph.png")

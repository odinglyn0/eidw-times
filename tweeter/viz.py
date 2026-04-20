import os
import io
import tempfile
import seaborn as sns
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import matplotlib.font_manager as fm
from fontTools.ttLib import TTFont
from PIL import Image


def _woff2_to_ttf(woff2_path):
    font = TTFont(woff2_path)
    font.flavor = None
    tmp = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False)
    font.save(tmp.name)
    font.close()
    return tmp.name


_DIR = os.path.dirname(__file__)
_WOFF2_PATH = os.path.join(_DIR, "font.woff2")
_BG_PATH = os.path.join(_DIR, "bg.png")
_TTF_PATH = _woff2_to_ttf(_WOFF2_PATH)
fm.fontManager.addfont(_TTF_PATH)
_FONT_PROP = fm.FontProperties(fname=_TTF_PATH)
_FONT_FAMILY = _FONT_PROP.get_name()

_WHITE = "#ffffff"


def plot_security_times(
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
) -> bytes:
    plt.rcParams["font.family"] = _FONT_FAMILY
    sns.set_theme(
        style="whitegrid",
        rc={
            "font.family": _FONT_FAMILY,
            "text.color": _WHITE,
            "axes.labelcolor": _WHITE,
            "xtick.color": _WHITE,
            "ytick.color": _WHITE,
        },
    )

    fig, ax = plt.subplots(figsize=(30, 20), dpi=100)
    fig.patch.set_alpha(0)
    ax.patch.set_alpha(0)

    x_labels = ["Last Hour", "Now", "Next Hour", "In 2 Hours", "In 3 Hours"]
    x = list(range(len(x_labels)))

    t1_values = [t1_last_hour, t1_now, t1_next_hour, t1_in_2_hours, t1_in_3_hours]
    t2_values = [t2_last_hour, t2_now, t2_next_hour, t2_in_2_hours, t2_in_3_hours]

    t1_color = "#1f77b4"
    t2_color = "#2ca02c"

    ax.plot(x[:2], t1_values[:2], color=t1_color, linewidth=5, solid_capstyle="round")
    ax.plot(
        x[1:],
        t1_values[1:],
        color=t1_color,
        linewidth=5,
        linestyle="dotted",
        label="Terminal 1",
    )

    ax.plot(x[:2], t2_values[:2], color=t2_color, linewidth=5, solid_capstyle="round")
    ax.plot(
        x[1:],
        t2_values[1:],
        color=t2_color,
        linewidth=5,
        linestyle="dotted",
        label="Terminal 2",
    )

    ax.plot(
        x[:2],
        t1_values[:2],
        color=t1_color,
        linewidth=5,
        solid_capstyle="round",
        label="_nolegend_",
    )
    ax.plot(
        x[:2],
        t2_values[:2],
        color=t2_color,
        linewidth=5,
        solid_capstyle="round",
        label="_nolegend_",
    )

    for xi, yi in zip(x, t1_values):
        ax.scatter(xi, yi, color=t1_color, s=120, zorder=5)

    for xi, yi in zip(x, t2_values):
        ax.scatter(xi, yi, color=t2_color, s=120, zorder=5)

    ax.set_xticks(x)
    ax.set_xticklabels(x_labels, fontsize=22, color=_WHITE)
    ax.set_xlabel("Times", fontsize=30, labelpad=16, color=_WHITE, fontstyle="italic")
    ax.set_ylabel(
        "Duration (minutes)", fontsize=30, labelpad=16, color=_WHITE, fontstyle="italic"
    )

    ax.yaxis.set_major_locator(ticker.MaxNLocator(integer=True))
    ax.tick_params(axis="y", labelsize=20, colors=_WHITE)
    ax.tick_params(axis="x", colors=_WHITE)
    ax.grid(color=(1, 1, 1, 0.3), linewidth=0.8)
    for spine in ax.spines.values():
        spine.set_color(_WHITE)

    ax.set_title(
        "Past, present and predicted security times for T1 and T2, Dublin Airport",
        fontsize=30,
        pad=28,
        fontweight="bold",
        color=_WHITE,
    )

    handles, labels = ax.get_legend_handles_labels()
    seen = {}
    unique_handles = []
    unique_labels = []
    for h, l in zip(handles, labels):
        if l not in seen and not l.startswith("_"):
            seen[l] = True
            unique_handles.append(h)
            unique_labels.append(l)

    legend = ax.legend(
        unique_handles,
        unique_labels,
        loc="lower left",
        fontsize=22,
        frameon=True,
        framealpha=0.3,
        edgecolor=_WHITE,
    )
    for text in legend.get_texts():
        text.set_color(_WHITE)

    ax.axvline(x=1, color="grey", linestyle="--", linewidth=1.5, alpha=0.5)

    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=100, bbox_inches="tight", transparent=True)
    plt.close()
    buf.seek(0)
    graph_img = Image.open(buf).convert("RGBA")
    new_w = int(graph_img.width * 0.95)
    new_h = int(graph_img.height * 0.95)
    graph_img = graph_img.resize((new_w, new_h), Image.LANCZOS)
    bg = Image.open(_BG_PATH).convert("RGBA")
    offset_x = (bg.width - new_w) // 2
    offset_y = (bg.height - new_h) // 2
    bg.paste(graph_img, (offset_x, offset_y), graph_img)

    out = io.BytesIO()
    bg.save(out, format="PNG")
    return out.getvalue()

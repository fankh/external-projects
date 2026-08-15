"""
Seekurity Brand Color Palette
IBM Carbon Design System inspired colors for professional presentations.
"""

# Primary Brand Colors
PRIMARY_BLUE = "#0f62fe"
SECONDARY_BLUE = "#0353e9"
TERTIARY_BLUE = "#4589ff"
LIGHT_BLUE = "#d0e2ff"

# Neutral Colors
BLACK = "#161616"
GRAY_100 = "#1c1c1c"
GRAY_90 = "#262626"
GRAY_80 = "#393939"
GRAY_70 = "#525252"
GRAY_60 = "#6f6f6f"
GRAY_50 = "#8d8d8d"
GRAY_40 = "#a8a8a8"
GRAY_30 = "#c6c6c6"
GRAY_20 = "#e0e0e0"
GRAY_10 = "#f4f4f4"
WHITE = "#ffffff"

# Semantic Colors
SUCCESS_GREEN = "#198038"
SUCCESS_LIGHT = "#a7f0ba"
WARNING_YELLOW = "#f1c21b"
WARNING_LIGHT = "#fcf4d6"
ERROR_RED = "#da1e28"
ERROR_LIGHT = "#ffd7d9"
INFO_BLUE = "#0043ce"
INFO_LIGHT = "#edf5ff"

# Accent Colors (for diagrams)
PURPLE = "#8a3ffc"
PURPLE_LIGHT = "#e8daff"
TEAL = "#009d9a"
TEAL_LIGHT = "#9ef0f0"
MAGENTA = "#ee5396"
MAGENTA_LIGHT = "#ffd6e8"
CYAN = "#1192e8"
CYAN_LIGHT = "#bae6ff"

# Gradient definitions
GRADIENT_BLUE = f"url(#gradient_blue)"
GRADIENT_SUCCESS = f"url(#gradient_success)"
GRADIENT_PURPLE = f"url(#gradient_purple)"

# Category Colors (for charts/diagrams)
CATEGORY_COLORS = [
    PRIMARY_BLUE,
    PURPLE,
    TEAL,
    MAGENTA,
    CYAN,
    SUCCESS_GREEN,
    WARNING_YELLOW,
]

# Status Colors
STATUS_COLORS = {
    "active": SUCCESS_GREEN,
    "pending": WARNING_YELLOW,
    "inactive": GRAY_50,
    "error": ERROR_RED,
    "info": INFO_BLUE,
}

# Layer Colors (for architecture diagrams)
LAYER_COLORS = {
    "presentation": TERTIARY_BLUE,
    "application": PRIMARY_BLUE,
    "data": SECONDARY_BLUE,
    "infrastructure": GRAY_80,
    "security": PURPLE,
    "network": TEAL,
}


def get_gradient_defs():
    """Return SVG gradient definitions for use in diagrams."""
    return f'''
    <defs>
        <linearGradient id="gradient_blue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:{TERTIARY_BLUE};stop-opacity:1" />
            <stop offset="100%" style="stop-color:{PRIMARY_BLUE};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="gradient_success" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:{SUCCESS_LIGHT};stop-opacity:1" />
            <stop offset="100%" style="stop-color:{SUCCESS_GREEN};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="gradient_purple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:{PURPLE_LIGHT};stop-opacity:1" />
            <stop offset="100%" style="stop-color:{PURPLE};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="gradient_dark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:{GRAY_80};stop-opacity:1" />
            <stop offset="100%" style="stop-color:{GRAY_100};stop-opacity:1" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="{BLACK}" flood-opacity="0.15"/>
        </filter>
        <filter id="shadow_light" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="{BLACK}" flood-opacity="0.1"/>
        </filter>
    </defs>
    '''

"""
SVG Icon Library for Security and Infrastructure Diagrams
Professional icons following IBM Carbon Design patterns.
"""

from .colors import (
    ERROR_RED,
    GRAY_70,
    PRIMARY_BLUE,
    SUCCESS_GREEN,
    WARNING_YELLOW,
    WHITE,
)


def get_security_icon(icon_name: str, size: int = 32, color: str = PRIMARY_BLUE) -> str:
    """
    Get an SVG icon by name.

    Args:
        icon_name: Name of the icon (firewall, server, cloud, etc.)
        size: Icon size in pixels
        color: Fill color for the icon

    Returns:
        SVG string for the icon
    """
    icons = {
        # Security Icons
        "firewall": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <rect x="4" y="6" width="24" height="20" rx="2" fill="{color}" opacity="0.2"/>
                <rect x="4" y="6" width="24" height="20" rx="2" stroke="{color}" stroke-width="2" fill="none"/>
                <line x1="4" y1="12" x2="28" y2="12" stroke="{color}" stroke-width="2"/>
                <line x1="4" y1="18" x2="28" y2="18" stroke="{color}" stroke-width="2"/>
                <circle cx="8" cy="9" r="1.5" fill="{color}"/>
                <circle cx="12" cy="9" r="1.5" fill="{color}"/>
                <circle cx="8" cy="15" r="1.5" fill="{color}"/>
                <circle cx="24" cy="15" r="1.5" fill="{color}"/>
                <circle cx="8" cy="21" r="1.5" fill="{color}"/>
                <circle cx="16" cy="21" r="1.5" fill="{color}"/>
            </svg>
        ''',
        "shield": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <path d="M16 3L4 8v8c0 7.18 5.12 13.88 12 16 6.88-2.12 12-8.82 12-16V8L16 3z"
                      fill="{color}" opacity="0.2"/>
                <path d="M16 3L4 8v8c0 7.18 5.12 13.88 12 16 6.88-2.12 12-8.82 12-16V8L16 3z"
                      stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M14 16l-3-3 1.5-1.5L14 13l4.5-4.5L20 10l-6 6z" fill="{color}"/>
            </svg>
        ''',
        "lock": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <rect x="6" y="14" width="20" height="14" rx="2" fill="{color}" opacity="0.2"/>
                <rect x="6" y="14" width="20" height="14" rx="2" stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M10 14V10a6 6 0 1 1 12 0v4" stroke="{color}" stroke-width="2" fill="none"/>
                <circle cx="16" cy="21" r="2" fill="{color}"/>
                <line x1="16" y1="23" x2="16" y2="25" stroke="{color}" stroke-width="2"/>
            </svg>
        ''',
        "alert": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <path d="M16 4L2 28h28L16 4z" fill="{color}" opacity="0.2"/>
                <path d="M16 4L2 28h28L16 4z" stroke="{color}" stroke-width="2" fill="none"/>
                <line x1="16" y1="12" x2="16" y2="20" stroke="{color}" stroke-width="2"/>
                <circle cx="16" cy="24" r="1.5" fill="{color}"/>
            </svg>
        ''',
        # Infrastructure Icons
        "server": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <rect x="4" y="4" width="24" height="8" rx="1" fill="{color}" opacity="0.2"/>
                <rect x="4" y="4" width="24" height="8" rx="1" stroke="{color}" stroke-width="2" fill="none"/>
                <rect x="4" y="14" width="24" height="8" rx="1" fill="{color}" opacity="0.2"/>
                <rect x="4" y="14" width="24" height="8" rx="1" stroke="{color}" stroke-width="2" fill="none"/>
                <rect x="4" y="24" width="24" height="4" rx="1" fill="{color}"/>
                <circle cx="8" cy="8" r="1.5" fill="{color}"/>
                <circle cx="8" cy="18" r="1.5" fill="{color}"/>
                <line x1="22" y1="8" x2="24" y2="8" stroke="{color}" stroke-width="2"/>
                <line x1="22" y1="18" x2="24" y2="18" stroke="{color}" stroke-width="2"/>
            </svg>
        ''',
        "database": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <ellipse cx="16" cy="8" rx="10" ry="4" fill="{color}" opacity="0.2"/>
                <ellipse cx="16" cy="8" rx="10" ry="4" stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M6 8v16c0 2.21 4.48 4 10 4s10-1.79 10-4V8" stroke="{color}" stroke-width="2" fill="none"/>
                <ellipse cx="16" cy="16" rx="10" ry="4" stroke="{color}" stroke-width="2" fill="none" stroke-dasharray="4,2"/>
            </svg>
        ''',
        "cloud": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <path d="M25 14.5A5.5 5.5 0 0 0 19.5 9a5.5 5.5 0 0 0-5.27 3.9A4 4 0 0 0 10 17a4 4 0 0 0 4 4h10a5 5 0 0 0 5-5 5 5 0 0 0-4-1.5z"
                      fill="{color}" opacity="0.2"/>
                <path d="M25 14.5A5.5 5.5 0 0 0 19.5 9a5.5 5.5 0 0 0-5.27 3.9A4 4 0 0 0 10 17a4 4 0 0 0 4 4h10a5 5 0 0 0 5-5 5 5 0 0 0-4-1.5z"
                      stroke="{color}" stroke-width="2" fill="none"/>
            </svg>
        ''',
        "network": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <circle cx="16" cy="8" r="4" fill="{color}" opacity="0.2"/>
                <circle cx="16" cy="8" r="4" stroke="{color}" stroke-width="2" fill="none"/>
                <circle cx="8" cy="24" r="4" fill="{color}" opacity="0.2"/>
                <circle cx="8" cy="24" r="4" stroke="{color}" stroke-width="2" fill="none"/>
                <circle cx="24" cy="24" r="4" fill="{color}" opacity="0.2"/>
                <circle cx="24" cy="24" r="4" stroke="{color}" stroke-width="2" fill="none"/>
                <line x1="16" y1="12" x2="10" y2="20" stroke="{color}" stroke-width="2"/>
                <line x1="16" y1="12" x2="22" y2="20" stroke="{color}" stroke-width="2"/>
            </svg>
        ''',
        # Application Icons
        "monitor": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <rect x="2" y="4" width="28" height="18" rx="2" fill="{color}" opacity="0.2"/>
                <rect x="2" y="4" width="28" height="18" rx="2" stroke="{color}" stroke-width="2" fill="none"/>
                <line x1="16" y1="22" x2="16" y2="26" stroke="{color}" stroke-width="2"/>
                <line x1="10" y1="28" x2="22" y2="28" stroke="{color}" stroke-width="2"/>
            </svg>
        ''',
        "document": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <path d="M6 4h14l6 6v18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="{color}" opacity="0.2"/>
                <path d="M6 4h14l6 6v18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M20 4v6h6" stroke="{color}" stroke-width="2" fill="none"/>
                <line x1="8" y1="16" x2="20" y2="16" stroke="{color}" stroke-width="2"/>
                <line x1="8" y1="20" x2="18" y2="20" stroke="{color}" stroke-width="2"/>
                <line x1="8" y1="24" x2="16" y2="24" stroke="{color}" stroke-width="2"/>
            </svg>
        ''',
        "user": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <circle cx="16" cy="10" r="6" fill="{color}" opacity="0.2"/>
                <circle cx="16" cy="10" r="6" stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M4 28c0-6.63 5.37-12 12-12s12 5.37 12 12" fill="{color}" opacity="0.2"/>
                <path d="M4 28c0-6.63 5.37-12 12-12s12 5.37 12 12" stroke="{color}" stroke-width="2" fill="none"/>
            </svg>
        ''',
        "users": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <circle cx="12" cy="10" r="5" fill="{color}" opacity="0.2"/>
                <circle cx="12" cy="10" r="5" stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M2 28c0-5.52 4.48-10 10-10s10 4.48 10 10" fill="{color}" opacity="0.2"/>
                <path d="M2 28c0-5.52 4.48-10 10-10s10 4.48 10 10" stroke="{color}" stroke-width="2" fill="none"/>
                <circle cx="22" cy="10" r="4" stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M30 28c0-4.42-3.58-8-8-8" stroke="{color}" stroke-width="2" fill="none"/>
            </svg>
        ''',
        # Status Icons
        "checkmark": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" fill="{SUCCESS_GREEN}" opacity="0.2"/>
                <circle cx="16" cy="16" r="12" stroke="{SUCCESS_GREEN}" stroke-width="2" fill="none"/>
                <path d="M10 16l4 4 8-8" stroke="{SUCCESS_GREEN}" stroke-width="3" fill="none"/>
            </svg>
        ''',
        "warning": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" fill="{WARNING_YELLOW}" opacity="0.2"/>
                <circle cx="16" cy="16" r="12" stroke="{WARNING_YELLOW}" stroke-width="2" fill="none"/>
                <line x1="16" y1="10" x2="16" y2="18" stroke="{WARNING_YELLOW}" stroke-width="3"/>
                <circle cx="16" cy="22" r="1.5" fill="{WARNING_YELLOW}"/>
            </svg>
        ''',
        "error": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" fill="{ERROR_RED}" opacity="0.2"/>
                <circle cx="16" cy="16" r="12" stroke="{ERROR_RED}" stroke-width="2" fill="none"/>
                <line x1="11" y1="11" x2="21" y2="21" stroke="{ERROR_RED}" stroke-width="3"/>
                <line x1="21" y1="11" x2="11" y2="21" stroke="{ERROR_RED}" stroke-width="3"/>
            </svg>
        ''',
        # Arrow Icons
        "arrow_right": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <path d="M6 16h18M18 10l6 6-6 6" stroke="{color}" stroke-width="2" fill="none"/>
            </svg>
        ''',
        "arrow_down": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <path d="M16 6v18M10 18l6 6 6-6" stroke="{color}" stroke-width="2" fill="none"/>
            </svg>
        ''',
        # Data Source Icons
        "log": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <rect x="4" y="4" width="24" height="24" rx="2" fill="{color}" opacity="0.2"/>
                <rect x="4" y="4" width="24" height="24" rx="2" stroke="{color}" stroke-width="2" fill="none"/>
                <line x1="8" y1="10" x2="24" y2="10" stroke="{color}" stroke-width="2"/>
                <line x1="8" y1="16" x2="20" y2="16" stroke="{color}" stroke-width="2"/>
                <line x1="8" y1="22" x2="22" y2="22" stroke="{color}" stroke-width="2"/>
            </svg>
        ''',
        "email": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <rect x="2" y="6" width="28" height="20" rx="2" fill="{color}" opacity="0.2"/>
                <rect x="2" y="6" width="28" height="20" rx="2" stroke="{color}" stroke-width="2" fill="none"/>
                <path d="M2 8l14 10 14-10" stroke="{color}" stroke-width="2" fill="none"/>
            </svg>
        ''',
        "endpoint": f'''
            <svg width="{size}" height="{size}" viewBox="0 0 32 32">
                <rect x="6" y="2" width="20" height="28" rx="2" fill="{color}" opacity="0.2"/>
                <rect x="6" y="2" width="20" height="28" rx="2" stroke="{color}" stroke-width="2" fill="none"/>
                <line x1="6" y1="6" x2="26" y2="6" stroke="{color}" stroke-width="2"/>
                <line x1="6" y1="24" x2="26" y2="24" stroke="{color}" stroke-width="2"/>
                <circle cx="16" cy="27" r="1.5" fill="{color}"/>
            </svg>
        ''',
    }

    return icons.get(icon_name, icons["document"])


def create_icon_grid(
    icons_list: list,
    cols: int = 4,
    icon_size: int = 48,
    spacing: int = 80,
    color: str = PRIMARY_BLUE,
) -> str:
    """
    Create a grid of icons with labels.

    Args:
        icons_list: List of tuples (icon_name, label)
        cols: Number of columns
        icon_size: Size of each icon
        spacing: Space between icons
        color: Icon color

    Returns:
        SVG string for the icon grid
    """
    rows = (len(icons_list) + cols - 1) // cols
    width = cols * spacing + 40
    height = rows * spacing + 40

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        <style>
            .icon-label {{
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 12px;
                fill: #525252;
                text-anchor: middle;
            }}
        </style>
    '''

    for i, (icon_name, label) in enumerate(icons_list):
        row = i // cols
        col = i % cols
        x = col * spacing + spacing // 2
        y = row * spacing + spacing // 2

        icon_svg = get_security_icon(icon_name, icon_size, color)
        # Position the icon
        svg_content += f'''
        <g transform="translate({x - icon_size // 2}, {y - icon_size // 2})">
            {icon_svg}
        </g>
        <text x="{x}" y="{y + icon_size // 2 + 20}" class="icon-label">{label}</text>
        '''

    svg_content += "</svg>"
    return svg_content

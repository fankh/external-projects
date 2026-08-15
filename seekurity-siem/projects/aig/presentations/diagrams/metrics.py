"""
Metrics and Dashboard Diagram Generators
Professional SVG diagrams for KPIs, charts, and visual metrics.
"""

import math

from .colors import (
    CATEGORY_COLORS,
    CYAN,
    ERROR_RED,
    GRAY_10,
    GRAY_20,
    GRAY_30,
    GRAY_40,
    GRAY_50,
    GRAY_60,
    GRAY_70,
    GRAY_80,
    LIGHT_BLUE,
    MAGENTA,
    PRIMARY_BLUE,
    PURPLE,
    SECONDARY_BLUE,
    SUCCESS_GREEN,
    TEAL,
    TERTIARY_BLUE,
    WARNING_YELLOW,
    WHITE,
    get_gradient_defs,
)


def create_kpi_dashboard(kpis: list = None, width: int = 900, height: int = 200) -> str:
    """
    Create a KPI dashboard with metric cards.

    Args:
        kpis: List of KPI dicts with 'label', 'value', 'target', 'unit', 'status'
        width: SVG width
        height: SVG height

    Returns:
        SVG string for the KPI dashboard
    """
    if kpis is None:
        kpis = [
            {
                "label": "Log Sources",
                "value": "24",
                "target": "24",
                "unit": "",
                "status": "success",
            },
            {
                "label": "Daily Events",
                "value": "1.2",
                "target": "1.5",
                "unit": "B",
                "status": "success",
            },
            {
                "label": "Parse Rate",
                "value": "98.5",
                "target": "95",
                "unit": "%",
                "status": "success",
            },
            {
                "label": "Uptime",
                "value": "99.9",
                "target": "99.5",
                "unit": "%",
                "status": "success",
            },
            {
                "label": "MTTD",
                "value": "4.2",
                "target": "5",
                "unit": "min",
                "status": "success",
            },
            {
                "label": "False Positive",
                "value": "12",
                "target": "20",
                "unit": "%",
                "status": "warning",
            },
        ]

    card_width = (width - 40 - (len(kpis) - 1) * 15) // len(kpis)
    card_height = height - 40

    status_colors = {
        "success": SUCCESS_GREEN,
        "warning": WARNING_YELLOW,
        "error": ERROR_RED,
        "neutral": GRAY_50,
    }

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .kpi-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_60}; text-anchor: middle; }}
            .kpi-value {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 32px; font-weight: 700; text-anchor: middle; }}
            .kpi-unit {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 500; }}
            .kpi-target {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_50}; text-anchor: middle; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>
    '''

    for i, kpi in enumerate(kpis):
        x = 20 + i * (card_width + 15)
        color = status_colors.get(kpi.get("status", "neutral"), GRAY_50)

        svg_content += f'''
        <g transform="translate({x}, 20)">
            <!-- Card -->
            <rect width="{card_width}" height="{card_height}" rx="8" fill="{WHITE}"
                  stroke="{GRAY_20}" stroke-width="1" filter="url(#shadow_light)"/>

            <!-- Top accent bar -->
            <rect width="{card_width}" height="4" rx="8" fill="{color}"/>
            <rect x="0" y="4" width="{card_width}" height="4" fill="{WHITE}"/>

            <!-- Label -->
            <text class="kpi-label" x="{card_width // 2}" y="35">{kpi["label"]}</text>

            <!-- Value -->
            <text class="kpi-value" x="{card_width // 2 - 5}" y="85" fill="{color}">{kpi["value"]}</text>
            <text class="kpi-unit" x="{card_width // 2 + len(kpi["value"]) * 10}" y="85" fill="{color}">{kpi["unit"]}</text>

            <!-- Target -->
            <text class="kpi-target" x="{card_width // 2}" y="115">Target: {kpi["target"]}{kpi["unit"]}</text>

            <!-- Status indicator -->
            <circle cx="{card_width - 15}" cy="15" r="6" fill="{color}"/>
        </g>
        '''

    svg_content += "</svg>"
    return svg_content


def create_mini_kpi_card(
    label: str, value: str, trend: str = None, width: int = 180, height: int = 100
) -> str:
    """
    Create a compact KPI card for split layouts.

    Args:
        label: KPI label
        value: KPI value
        trend: Optional trend indicator (up, down, neutral)
        width: SVG width
        height: SVG height

    Returns:
        SVG string for mini KPI card
    """
    trend_icons = {
        "up": (SUCCESS_GREEN, "M0 5 l5 -8 l5 8"),
        "down": (ERROR_RED, "M0 -3 l5 8 l5 -8"),
        "neutral": (GRAY_50, "M0 0 l10 0"),
    }

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8" stroke="{GRAY_20}" stroke-width="1"/>
        <rect width="{width}" height="6" fill="{PRIMARY_BLUE}" rx="8"/>
        <rect y="4" width="{width}" height="4" fill="{PRIMARY_BLUE}"/>

        <text font-family="Segoe UI" font-size="12" fill="{GRAY_60}" x="{width / 2}" y="30" text-anchor="middle">{label}</text>
        <text font-family="Segoe UI" font-size="28" font-weight="700" fill="{GRAY_80}" x="{width / 2}" y="65" text-anchor="middle">{value}</text>
    '''

    if trend:
        color, path = trend_icons.get(trend, trend_icons["neutral"])
        svg_content += f'''
        <g transform="translate({width / 2 + 30}, 55)">
            <path d="{path}" fill="{color}"/>
        </g>
        '''

    svg_content += "</svg>"
    return svg_content


def create_vertical_bar_chart(
    data: list = None, width: int = 350, height: int = 280
) -> str:
    """
    Create a vertical bar chart for split layouts.

    Args:
        data: List of dicts with 'label', 'value', 'max_value'
        width: SVG width
        height: SVG height

    Returns:
        SVG string for vertical bar chart
    """
    if data is None:
        data = [
            {"label": "Windows", "value": 85, "max_value": 100},
            {"label": "Linux", "value": 72, "max_value": 100},
            {"label": "Network", "value": 91, "max_value": 100},
            {"label": "Cloud", "value": 68, "max_value": 100},
            {"label": "Security", "value": 95, "max_value": 100},
        ]

    bar_colors = [PRIMARY_BLUE, SECONDARY_BLUE, TERTIARY_BLUE, TEAL, CYAN]
    chart_left = 80
    chart_width = width - chart_left - 30
    bar_height = 28
    bar_gap = 12
    chart_top = 50

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .axis-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_60}; }}
            .bar-value {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: {WHITE}; }}
            .title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 600; fill: {GRAY_80}; }}
        </style>

        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8" stroke="{GRAY_20}" stroke-width="1"/>
        <text class="title" x="20" y="30">Coverage by Category</text>
    '''

    for i, item in enumerate(data):
        y = chart_top + i * (bar_height + bar_gap)
        bar_width = (item["value"] / item["max_value"]) * chart_width
        color = bar_colors[i % len(bar_colors)]

        svg_content += f'''
        <text class="axis-label" x="{chart_left - 10}" y="{y + bar_height / 2 + 4}" text-anchor="end">{item["label"]}</text>
        <rect x="{chart_left}" y="{y}" width="{chart_width}" height="{bar_height}" fill="{GRAY_10}" rx="4"/>
        <rect x="{chart_left}" y="{y}" width="{bar_width}" height="{bar_height}" fill="{color}" rx="4"/>
        <text class="bar-value" x="{chart_left + bar_width - 8}" y="{y + bar_height / 2 + 4}" text-anchor="end">{item["value"]}%</text>
        '''

    svg_content += "</svg>"
    return svg_content


def create_donut_chart(
    value: int, total: int = 100, label: str = "", width: int = 200, height: int = 200
) -> str:
    """
    Create a donut chart for split layouts.

    Args:
        value: Current value
        total: Total/max value
        label: Center label
        width: SVG width
        height: SVG height

    Returns:
        SVG string for donut chart
    """
    cx, cy = width / 2, height / 2
    radius = min(width, height) / 2 - 20
    stroke_width = 18
    circumference = 2 * math.pi * radius
    progress = (value / total) * circumference

    # Determine color based on percentage
    pct = value / total * 100
    if pct >= 80:
        color = SUCCESS_GREEN
    elif pct >= 60:
        color = PRIMARY_BLUE
    elif pct >= 40:
        color = WARNING_YELLOW
    else:
        color = ERROR_RED

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}

        <!-- Background circle -->
        <circle cx="{cx}" cy="{cy}" r="{radius}" fill="none" stroke="{GRAY_20}" stroke-width="{stroke_width}"/>

        <!-- Progress circle -->
        <circle cx="{cx}" cy="{cy}" r="{radius}" fill="none" stroke="{color}" stroke-width="{stroke_width}"
                stroke-dasharray="{progress} {circumference}" stroke-linecap="round"
                transform="rotate(-90 {cx} {cy})"/>

        <!-- Center text -->
        <text font-family="Segoe UI" font-size="32" font-weight="700" fill="{GRAY_80}"
              x="{cx}" y="{cy + 5}" text-anchor="middle">{value}%</text>
        <text font-family="Segoe UI" font-size="12" fill="{GRAY_60}"
              x="{cx}" y="{cy + 25}" text-anchor="middle">{label}</text>
    </svg>
    '''
    return svg_content


def create_timeline_compact(
    phases: list = None, width: int = 500, height: int = 120
) -> str:
    """
    Create a compact horizontal timeline for split layouts.

    Args:
        phases: List of phase dicts with 'name', 'status'
        width: SVG width
        height: SVG height

    Returns:
        SVG string for compact timeline
    """
    if phases is None:
        phases = [
            {"name": "Discovery", "status": "complete"},
            {"name": "Design", "status": "complete"},
            {"name": "Build", "status": "in_progress"},
            {"name": "Test", "status": "pending"},
            {"name": "Deploy", "status": "pending"},
        ]

    status_colors = {
        "complete": SUCCESS_GREEN,
        "in_progress": PRIMARY_BLUE,
        "pending": GRAY_40,
    }

    node_radius = 14
    start_x = 50
    end_x = width - 50
    line_y = 45
    spacing = (end_x - start_x) / (len(phases) - 1) if len(phases) > 1 else 0

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .phase-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_70}; }}
        </style>

        <!-- Background line -->
        <line x1="{start_x}" y1="{line_y}" x2="{end_x}" y2="{line_y}" stroke="{GRAY_30}" stroke-width="3"/>
    '''

    # Draw completed portion
    completed_count = sum(1 for p in phases if p["status"] == "complete")
    if completed_count > 0:
        completed_x = start_x + (completed_count - 1) * spacing
        in_progress = any(p["status"] == "in_progress" for p in phases)
        if in_progress and completed_count < len(phases):
            completed_x += spacing / 2
        svg_content += f'<line x1="{start_x}" y1="{line_y}" x2="{completed_x}" y2="{line_y}" stroke="{SUCCESS_GREEN}" stroke-width="3"/>'

    # Draw nodes
    for i, phase in enumerate(phases):
        x = start_x + i * spacing
        color = status_colors.get(phase["status"], GRAY_40)

        svg_content += f'''
        <circle cx="{x}" cy="{line_y}" r="{node_radius}" fill="{WHITE}" stroke="{color}" stroke-width="3"/>
        '''

        if phase["status"] == "complete":
            svg_content += f'<path d="M{x - 5} {line_y} l3 4 l7 -8" stroke="{color}" stroke-width="2" fill="none"/>'
        elif phase["status"] == "in_progress":
            svg_content += f'<circle cx="{x}" cy="{line_y}" r="5" fill="{color}"/>'

        svg_content += f'<text class="phase-label" x="{x}" y="{line_y + 35}" text-anchor="middle">{phase["name"]}</text>'

    svg_content += "</svg>"
    return svg_content


def create_stat_list(stats: list = None, width: int = 300, height: int = 220) -> str:
    """
    Create a statistics list card for split layouts.

    Args:
        stats: List of stat dicts with 'label', 'value', 'icon'
        width: SVG width
        height: SVG height

    Returns:
        SVG string for stat list
    """
    if stats is None:
        stats = [
            {"label": "Total Log Sources", "value": "24"},
            {"label": "Events Per Second", "value": "14,500"},
            {"label": "Active Rules", "value": "156"},
            {"label": "Avg Response Time", "value": "4.2 min"},
            {"label": "Storage Used", "value": "2.4 TB"},
        ]

    row_height = 38

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .stat-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; fill: {GRAY_60}; }}
            .stat-value {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 600; fill: {GRAY_80}; }}
        </style>

        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8" stroke="{GRAY_20}" stroke-width="1"/>
    '''

    for i, stat in enumerate(stats):
        y = 20 + i * row_height

        svg_content += f'''
        <rect x="15" y="{y}" width="4" height="{row_height - 8}" fill="{PRIMARY_BLUE}" rx="2"/>
        <text class="stat-label" x="30" y="{y + 14}">{stat["label"]}</text>
        <text class="stat-value" x="{width - 20}" y="{y + 14}" text-anchor="end">{stat["value"]}</text>
        '''

        if i < len(stats) - 1:
            svg_content += f'<line x1="30" y1="{y + row_height - 4}" x2="{width - 20}" y2="{y + row_height - 4}" stroke="{GRAY_10}" stroke-width="1"/>'

    svg_content += "</svg>"
    return svg_content


def create_risk_matrix(width: int = 350, height: int = 300) -> str:
    """
    Create a risk assessment matrix for split layouts.

    Args:
        width: SVG width
        height: SVG height

    Returns:
        SVG string for risk matrix
    """
    cell_size = 55
    matrix_left = 70
    matrix_top = 50

    # Risk levels: likelihood (rows) x impact (cols)
    colors = [
        [SUCCESS_GREEN, SUCCESS_GREEN, WARNING_YELLOW, WARNING_YELLOW, ERROR_RED],
        [SUCCESS_GREEN, WARNING_YELLOW, WARNING_YELLOW, ERROR_RED, ERROR_RED],
        [WARNING_YELLOW, WARNING_YELLOW, ERROR_RED, ERROR_RED, ERROR_RED],
        [WARNING_YELLOW, ERROR_RED, ERROR_RED, ERROR_RED, ERROR_RED],
        [ERROR_RED, ERROR_RED, ERROR_RED, ERROR_RED, ERROR_RED],
    ]

    # Sample risk items positioned in matrix
    risks = [
        {"x": 1, "y": 3, "id": "R1"},
        {"x": 2, "y": 2, "id": "R2"},
        {"x": 3, "y": 1, "id": "R3"},
        {"x": 0, "y": 4, "id": "R4"},
    ]

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .axis-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_60}; }}
            .title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 600; fill: {GRAY_80}; }}
            .risk-id {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: {WHITE}; }}
        </style>

        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8" stroke="{GRAY_20}" stroke-width="1"/>
        <text class="title" x="20" y="30">Risk Assessment Matrix</text>

        <!-- Y-axis label -->
        <text class="axis-label" transform="rotate(-90)" x="-180" y="20" text-anchor="middle">Likelihood</text>

        <!-- X-axis label -->
        <text class="axis-label" x="{matrix_left + 2.5 * cell_size}" y="{matrix_top + 5 * cell_size + 25}" text-anchor="middle">Impact</text>
    '''

    # Draw matrix cells
    for row in range(5):
        for col in range(5):
            x = matrix_left + col * cell_size
            y = matrix_top + (4 - row) * cell_size  # Invert rows so high is top
            svg_content += f'<rect x="{x}" y="{y}" width="{cell_size - 2}" height="{cell_size - 2}" fill="{colors[row][col]}" opacity="0.3" rx="4"/>'

    # Draw risk markers
    for risk in risks:
        x = matrix_left + risk["x"] * cell_size + cell_size / 2
        y = matrix_top + (4 - risk["y"]) * cell_size + cell_size / 2
        svg_content += f'''
        <circle cx="{x}" cy="{y}" r="16" fill="{PRIMARY_BLUE}"/>
        <text class="risk-id" x="{x}" y="{y + 4}" text-anchor="middle">{risk["id"]}</text>
        '''

    svg_content += "</svg>"
    return svg_content


def create_progress_ring(
    value: float,
    target: float = 100,
    size: int = 150,
    label: str = "",
    color: str = None,
) -> str:
    """
    Create a circular progress ring.

    Args:
        value: Current value
        target: Target value (100 for percentage)
        size: Ring size in pixels
        label: Label text
        color: Ring color (auto-selected based on value if None)

    Returns:
        SVG string for the progress ring
    """
    percentage = min(value / target * 100, 100)

    # Auto-select color based on percentage
    if color is None:
        if percentage >= 90:
            color = SUCCESS_GREEN
        elif percentage >= 70:
            color = WARNING_YELLOW
        else:
            color = ERROR_RED

    # Calculate ring parameters
    cx, cy = size // 2, size // 2
    radius = size // 2 - 15
    stroke_width = 12
    circumference = 2 * math.pi * radius
    dash_offset = circumference * (1 - percentage / 100)

    return f'''
    <svg width="{size}" height="{size + 30}" xmlns="http://www.w3.org/2000/svg">
        <style>
            .ring-value {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 28px; font-weight: 700; fill: {GRAY_80}; text-anchor: middle; }}
            .ring-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; fill: {GRAY_60}; text-anchor: middle; }}
        </style>

        <!-- Background ring -->
        <circle cx="{cx}" cy="{cy}" r="{radius}" fill="none"
                stroke="{GRAY_20}" stroke-width="{stroke_width}"/>

        <!-- Progress ring -->
        <circle cx="{cx}" cy="{cy}" r="{radius}" fill="none"
                stroke="{color}" stroke-width="{stroke_width}"
                stroke-linecap="round"
                stroke-dasharray="{circumference}"
                stroke-dashoffset="{dash_offset}"
                transform="rotate(-90 {cx} {cy})"/>

        <!-- Center value -->
        <text class="ring-value" x="{cx}" y="{cy + 8}">{value:.0f}%</text>

        <!-- Label -->
        <text class="ring-label" x="{cx}" y="{size + 20}">{label}</text>
    </svg>
    '''


def create_comparison_chart(
    data: list = None, width: int = 400, height: int = 300
) -> str:
    """
    Create a before/after comparison bar chart.

    Args:
        data: List of dicts with 'label', 'before', 'after' keys
        width: SVG width
        height: SVG height

    Returns:
        SVG string for the comparison chart
    """
    if data is None:
        data = [
            {"label": "Detection Coverage", "before": 45, "after": 92},
            {"label": "MTTD (minutes)", "before": 180, "after": 12},
            {"label": "Log Sources", "before": 8, "after": 24},
            {"label": "Compliance Score", "before": 60, "after": 95},
        ]

    bar_height = 35
    bar_spacing = 15
    chart_top = 60
    chart_left = 130
    chart_width = width - chart_left - 40

    # Find max value for scaling
    max_val = max(max(d["before"], d["after"]) for d in data)

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .axis-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_70}; }}
            .bar-value {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; font-weight: 600; fill: {WHITE}; }}
            .legend-text {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_70}; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Title -->
        <text font-family="Segoe UI" font-size="14" font-weight="600" fill="{GRAY_80}" x="20" y="25">Before vs After Comparison</text>

        <!-- Legend -->
        <g transform="translate({width - 180}, 15)">
            <rect width="12" height="12" rx="2" fill="{GRAY_50}"/>
            <text class="legend-text" x="18" y="10">Before</text>
            <rect x="70" width="12" height="12" rx="2" fill="{SUCCESS_GREEN}"/>
            <text class="legend-text" x="88" y="10">After</text>
        </g>
    '''

    for i, item in enumerate(data):
        y = chart_top + i * (bar_height * 2 + bar_spacing)

        before_width = (item["before"] / max_val) * chart_width
        after_width = (item["after"] / max_val) * chart_width

        # Label
        svg_content += f'''
        <text class="axis-label" x="{chart_left - 10}" y="{y + bar_height}" text-anchor="end">{item["label"]}</text>
        '''

        # Before bar
        svg_content += f'''
        <rect x="{chart_left}" y="{y}" width="{before_width}" height="{bar_height - 5}"
              rx="4" fill="{GRAY_50}" filter="url(#shadow_light)"/>
        <text class="bar-value" x="{chart_left + before_width - 25}" y="{y + bar_height // 2 + 2}">{item["before"]}</text>
        '''

        # After bar
        svg_content += f'''
        <rect x="{chart_left}" y="{y + bar_height}" width="{after_width}" height="{bar_height - 5}"
              rx="4" fill="{SUCCESS_GREEN}" filter="url(#shadow_light)"/>
        <text class="bar-value" x="{chart_left + after_width - 25}" y="{y + bar_height + bar_height // 2 + 2}">{item["after"]}</text>
        '''

        # Improvement indicator
        if item["after"] != item["before"]:
            change = ((item["after"] - item["before"]) / item["before"]) * 100
            change_color = SUCCESS_GREEN if change > 0 else ERROR_RED
            change_text = f"+{change:.0f}%" if change > 0 else f"{change:.0f}%"
            svg_content += f'''
            <text font-family="Segoe UI" font-size="10" font-weight="600" fill="{change_color}"
                  x="{chart_left + max(before_width, after_width) + 10}" y="{y + bar_height}">{change_text}</text>
            '''

    svg_content += "</svg>"
    return svg_content


def create_pie_chart(
    data: list = None, size: int = 300, show_legend: bool = True
) -> str:
    """
    Create a pie/donut chart.

    Args:
        data: List of dicts with 'label', 'value', 'color' keys
        size: Chart size
        show_legend: Whether to show legend

    Returns:
        SVG string for the pie chart
    """
    if data is None:
        data = [
            {"label": "Network Security", "value": 35, "color": TEAL},
            {"label": "Endpoint", "value": 25, "color": PRIMARY_BLUE},
            {"label": "Identity", "value": 20, "color": PURPLE},
            {"label": "Cloud", "value": 12, "color": CYAN},
            {"label": "Other", "value": 8, "color": GRAY_50},
        ]

    total = sum(item["value"] for item in data)
    cx, cy = size // 2, size // 2
    radius = size // 2 - 40
    inner_radius = radius * 0.6  # Donut hole

    legend_height = len(data) * 25 + 20 if show_legend else 0
    total_height = size + legend_height

    svg_content = f'''
    <svg width="{size}" height="{total_height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .slice-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: {WHITE}; text-anchor: middle; }}
            .legend-text {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_70}; }}
            .center-value {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 24px; font-weight: 700; fill: {GRAY_80}; text-anchor: middle; }}
            .center-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_60}; text-anchor: middle; }}
        </style>
    '''

    # Draw slices
    current_angle = -90  # Start from top
    for item in data:
        percentage = item["value"] / total
        angle = percentage * 360

        # Calculate arc
        start_rad = math.radians(current_angle)
        end_rad = math.radians(current_angle + angle)

        # Outer arc
        x1 = cx + radius * math.cos(start_rad)
        y1 = cy + radius * math.sin(start_rad)
        x2 = cx + radius * math.cos(end_rad)
        y2 = cy + radius * math.sin(end_rad)

        # Inner arc
        x3 = cx + inner_radius * math.cos(end_rad)
        y3 = cy + inner_radius * math.sin(end_rad)
        x4 = cx + inner_radius * math.cos(start_rad)
        y4 = cy + inner_radius * math.sin(start_rad)

        large_arc = 1 if angle > 180 else 0

        path = f"M {x1} {y1} A {radius} {radius} 0 {large_arc} 1 {x2} {y2} L {x3} {y3} A {inner_radius} {inner_radius} 0 {large_arc} 0 {x4} {y4} Z"

        svg_content += f'''
        <path d="{path}" fill="{item["color"]}" stroke="{WHITE}" stroke-width="2" filter="url(#shadow_light)"/>
        '''

        # Label in middle of slice (if big enough)
        if percentage > 0.08:
            mid_angle = math.radians(current_angle + angle / 2)
            label_radius = (radius + inner_radius) / 2
            lx = cx + label_radius * math.cos(mid_angle)
            ly = cy + label_radius * math.sin(mid_angle)
            svg_content += f'''
            <text class="slice-label" x="{lx}" y="{ly + 4}">{percentage * 100:.0f}%</text>
            '''

        current_angle += angle

    # Center text
    svg_content += f'''
        <text class="center-value" x="{cx}" y="{cy}">{total}</text>
        <text class="center-label" x="{cx}" y="{cy + 18}">Total</text>
    '''

    # Legend
    if show_legend:
        svg_content += f'<g transform="translate(20, {size + 10})">'
        for i, item in enumerate(data):
            y = i * 25
            svg_content += f'''
            <rect x="0" y="{y}" width="16" height="16" rx="3" fill="{item["color"]}"/>
            <text class="legend-text" x="24" y="{y + 12}">{item["label"]}: {item["value"]} ({item["value"] / total * 100:.0f}%)</text>
            '''
        svg_content += "</g>"

    svg_content += "</svg>"
    return svg_content


def create_status_summary(
    items: list = None, width: int = 350, height: int = 250
) -> str:
    """
    Create a status summary card with indicators.

    Args:
        items: List of status items
        width: SVG width
        height: SVG height

    Returns:
        SVG string for status summary
    """
    if items is None:
        items = [
            {
                "label": "Platform Health",
                "status": "success",
                "detail": "All systems operational",
            },
            {
                "label": "Log Ingestion",
                "status": "success",
                "detail": "1.2B events/day",
            },
            {
                "label": "Alert Queue",
                "status": "warning",
                "detail": "12 pending review",
            },
            {"label": "Storage", "status": "success", "detail": "45% utilized"},
            {"label": "Backup", "status": "success", "detail": "Last: 2 hours ago"},
        ]

    status_icons = {
        "success": (SUCCESS_GREEN, "M-5 0 l3 3 l7 -7"),
        "warning": (WARNING_YELLOW, "M0 -6 v8 M0 5 v1"),
        "error": (ERROR_RED, "M-4 -4 l8 8 M4 -4 l-8 8"),
    }

    row_height = 40

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .item-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; font-weight: 500; fill: {GRAY_80}; }}
            .item-detail {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_60}; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8" stroke="{GRAY_20}" stroke-width="1" filter="url(#shadow_light)"/>

        <!-- Title -->
        <rect width="{width}" height="40" fill="{GRAY_10}" rx="8"/>
        <rect y="32" width="{width}" height="8" fill="{GRAY_10}"/>
        <text font-family="Segoe UI" font-size="14" font-weight="600" fill="{GRAY_80}" x="20" y="26">System Status</text>
    '''

    for i, item in enumerate(items):
        y = 55 + i * row_height
        color, icon_path = status_icons.get(item["status"], status_icons["success"])

        # Status icon
        svg_content += f'''
        <g transform="translate(30, {y + 8})">
            <circle r="10" fill="{color}" opacity="0.2"/>
            <path d="{icon_path}" stroke="{color}" stroke-width="2" fill="none"/>
        </g>
        '''

        # Label and detail
        svg_content += f'''
        <text class="item-label" x="50" y="{y + 5}">{item["label"]}</text>
        <text class="item-detail" x="50" y="{y + 22}">{item["detail"]}</text>
        '''

        # Separator line
        if i < len(items) - 1:
            svg_content += f'''
            <line x1="20" y1="{y + 35}" x2="{width - 20}" y2="{y + 35}" stroke="{GRAY_20}" stroke-width="1"/>
            '''

    svg_content += "</svg>"
    return svg_content

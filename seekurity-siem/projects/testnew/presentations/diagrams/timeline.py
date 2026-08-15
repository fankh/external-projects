"""
Timeline and Roadmap Diagram Generators
Professional SVG diagrams for project timelines and milestones.
"""

from .colors import (
    CYAN,
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


def create_phase_timeline(
    phases: list = None, width: int = 900, height: int = 200
) -> str:
    """
    Create a horizontal phase timeline diagram.

    Args:
        phases: List of dicts with 'name', 'duration', 'color' keys
        width: SVG width
        height: SVG height

    Returns:
        SVG string for the timeline
    """
    if phases is None:
        phases = [
            {
                "name": "Foundation",
                "duration": "2 weeks",
                "color": TEAL,
                "status": "complete",
            },
            {
                "name": "Integration",
                "duration": "4 weeks",
                "color": PRIMARY_BLUE,
                "status": "active",
            },
            {
                "name": "Detection",
                "duration": "3 weeks",
                "color": PURPLE,
                "status": "pending",
            },
            {
                "name": "Transition",
                "duration": "2 weeks",
                "color": SECONDARY_BLUE,
                "status": "pending",
            },
        ]

    phase_width = (width - 100) // len(phases)

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .phase-title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 600; fill: {WHITE}; text-anchor: middle; }}
            .phase-duration {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {WHITE}; text-anchor: middle; opacity: 0.8; }}
            .phase-number {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 24px; font-weight: 700; fill: {WHITE}; text-anchor: middle; opacity: 0.3; }}
            .timeline-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_60}; text-anchor: middle; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Timeline base line -->
        <line x1="50" y1="{height // 2 + 50}" x2="{width - 50}" y2="{height // 2 + 50}"
              stroke="{GRAY_30}" stroke-width="3" stroke-linecap="round"/>
    '''

    # Draw phases
    for i, phase in enumerate(phases):
        x = 50 + i * phase_width

        # Phase box
        svg_content += f'''
        <g transform="translate({x}, 30)">
            <rect width="{phase_width - 20}" height="80" rx="6" fill="{phase["color"]}" filter="url(#shadow_light)"/>
            <text class="phase-number" x="{(phase_width - 20) // 2}" y="30">{i + 1}</text>
            <text class="phase-title" x="{(phase_width - 20) // 2}" y="50">{phase["name"]}</text>
            <text class="phase-duration" x="{(phase_width - 20) // 2}" y="68">{phase["duration"]}</text>
        </g>
        '''

        # Timeline node
        node_color = (
            SUCCESS_GREEN
            if phase.get("status") == "complete"
            else (PRIMARY_BLUE if phase.get("status") == "active" else GRAY_50)
        )
        svg_content += f'''
        <circle cx="{x + (phase_width - 20) // 2}" cy="{height // 2 + 50}" r="12"
                fill="{node_color}" stroke="{WHITE}" stroke-width="3"/>
        '''

        # Connector line
        svg_content += f'''
        <line x1="{x + (phase_width - 20) // 2}" y1="110" x2="{x + (phase_width - 20) // 2}" y2="{height // 2 + 38}"
              stroke="{phase["color"]}" stroke-width="2" stroke-dasharray="4,2"/>
        '''

        # Status indicator
        if phase.get("status") == "complete":
            svg_content += f'''
            <path d="M{x + (phase_width - 20) // 2 - 5} {height // 2 + 50} l3 3 l7 -7"
                  stroke="{WHITE}" stroke-width="2" fill="none"/>
            '''

    # Timeline labels
    svg_content += f'''
        <text class="timeline-label" x="50" y="{height // 2 + 75}">Start</text>
        <text class="timeline-label" x="{width - 50}" y="{height // 2 + 75}">Go-Live</text>
    '''

    svg_content += "</svg>"
    return svg_content


def create_gantt_chart(tasks: list = None, width: int = 900, height: int = 400) -> str:
    """
    Create a Gantt chart style timeline.

    Args:
        tasks: List of task dicts with 'name', 'start_week', 'duration', 'phase'
        width: SVG width
        height: SVG height

    Returns:
        SVG string for the Gantt chart
    """
    if tasks is None:
        tasks = [
            {"name": "Environment Setup", "start_week": 0, "duration": 1, "phase": 1},
            {
                "name": "Platform Installation",
                "start_week": 1,
                "duration": 1,
                "phase": 1,
            },
            {"name": "P1 Log Sources", "start_week": 2, "duration": 2, "phase": 2},
            {"name": "P2 Log Sources", "start_week": 4, "duration": 2, "phase": 2},
            {"name": "Parser Development", "start_week": 3, "duration": 3, "phase": 2},
            {"name": "Use Case Deployment", "start_week": 6, "duration": 2, "phase": 3},
            {"name": "Alert Tuning", "start_week": 7, "duration": 2, "phase": 3},
            {"name": "Dashboard Creation", "start_week": 6, "duration": 2, "phase": 3},
            {"name": "Training", "start_week": 9, "duration": 1, "phase": 4},
            {"name": "Documentation", "start_week": 8, "duration": 2, "phase": 4},
            {"name": "FVT & Sign-off", "start_week": 10, "duration": 1, "phase": 4},
        ]

    total_weeks = 12
    phase_colors = {1: TEAL, 2: PRIMARY_BLUE, 3: PURPLE, 4: SECONDARY_BLUE}

    row_height = 30
    header_height = 60
    left_margin = 180
    chart_width = width - left_margin - 40
    week_width = chart_width / total_weeks

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .header {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: {GRAY_70}; text-anchor: middle; }}
            .task-name {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_80}; }}
            .week-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_60}; text-anchor: middle; }}
            .phase-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; fill: {WHITE}; text-anchor: middle; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Header background -->
        <rect x="0" y="0" width="{width}" height="{header_height}" fill="{GRAY_10}" rx="8"/>
        <rect x="0" y="{header_height - 8}" width="{width}" height="8" fill="{GRAY_10}"/>

        <!-- Week headers -->
        <text class="header" x="{left_margin // 2}" y="35">Task</text>
    '''

    # Week columns
    for week in range(total_weeks):
        x = left_margin + week * week_width
        svg_content += f'''
        <text class="week-label" x="{x + week_width // 2}" y="25">Week</text>
        <text class="week-label" x="{x + week_width // 2}" y="40">{week + 1}</text>
        '''

        # Vertical grid lines
        if week > 0:
            svg_content += f'''
            <line x1="{x}" y1="{header_height}" x2="{x}" y2="{height - 20}"
                  stroke="{GRAY_20}" stroke-width="1" stroke-dasharray="4,4"/>
            '''

    # Task rows
    for i, task in enumerate(tasks):
        y = header_height + 10 + i * row_height
        bar_x = left_margin + task["start_week"] * week_width + 2
        bar_width = task["duration"] * week_width - 4
        color = phase_colors.get(task["phase"], GRAY_70)

        # Alternating row background
        if i % 2 == 0:
            svg_content += f'''
            <rect x="0" y="{y - 5}" width="{width}" height="{row_height}" fill="{GRAY_10}" opacity="0.5"/>
            '''

        # Task name
        svg_content += f'''
        <text class="task-name" x="20" y="{y + 15}">{task["name"]}</text>
        '''

        # Task bar
        svg_content += f'''
        <rect x="{bar_x}" y="{y}" width="{bar_width}" height="22" rx="4" fill="{color}" filter="url(#shadow_light)"/>
        '''

        # Phase label on bar if wide enough
        if bar_width > 50:
            svg_content += f'''
            <text class="phase-label" x="{bar_x + bar_width // 2}" y="{y + 15}">P{task["phase"]}</text>
            '''

    # Phase legend
    svg_content += f'''
        <g transform="translate(20, {height - 35})">
            <rect width="12" height="12" rx="2" fill="{TEAL}"/>
            <text class="week-label" x="18" y="10" text-anchor="start">Phase 1</text>

            <rect x="80" width="12" height="12" rx="2" fill="{PRIMARY_BLUE}"/>
            <text class="week-label" x="98" y="10" text-anchor="start">Phase 2</text>

            <rect x="160" width="12" height="12" rx="2" fill="{PURPLE}"/>
            <text class="week-label" x="178" y="10" text-anchor="start">Phase 3</text>

            <rect x="240" width="12" height="12" rx="2" fill="{SECONDARY_BLUE}"/>
            <text class="week-label" x="258" y="10" text-anchor="start">Phase 4</text>
        </g>
    '''

    svg_content += "</svg>"
    return svg_content


def create_milestone_roadmap(
    milestones: list = None, width: int = 900, height: int = 250
) -> str:
    """
    Create a milestone roadmap with icons and dates.

    Args:
        milestones: List of milestone dicts
        width: SVG width
        height: SVG height

    Returns:
        SVG string for the milestone roadmap
    """
    if milestones is None:
        milestones = [
            {"name": "Kickoff", "date": "Week 1", "status": "complete", "icon": "flag"},
            {
                "name": "Platform\nDeployed",
                "date": "Week 2",
                "status": "complete",
                "icon": "server",
            },
            {
                "name": "Sources\nIntegrated",
                "date": "Week 6",
                "status": "active",
                "icon": "database",
            },
            {
                "name": "Use Cases\nDeployed",
                "date": "Week 9",
                "status": "pending",
                "icon": "shield",
            },
            {
                "name": "Training\nComplete",
                "date": "Week 10",
                "status": "pending",
                "icon": "users",
            },
            {
                "name": "Go-Live",
                "date": "Week 11",
                "status": "pending",
                "icon": "rocket",
            },
        ]

    milestone_spacing = (
        (width - 100) // (len(milestones) - 1) if len(milestones) > 1 else width - 100
    )

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .milestone-name {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: {GRAY_80}; text-anchor: middle; }}
            .milestone-date {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_60}; text-anchor: middle; }}
            .status-complete {{ fill: {SUCCESS_GREEN}; }}
            .status-active {{ fill: {PRIMARY_BLUE}; }}
            .status-pending {{ fill: {GRAY_50}; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Main timeline -->
        <line x1="50" y1="{height // 2}" x2="{width - 50}" y2="{height // 2}"
              stroke="{GRAY_30}" stroke-width="4" stroke-linecap="round"/>
    '''

    # Progress fill (up to active milestone)
    active_index = next(
        (i for i, m in enumerate(milestones) if m["status"] == "active"),
        len(milestones),
    )
    if active_index > 0:
        progress_width = 50 + (active_index - 0.5) * milestone_spacing
        svg_content += f'''
        <line x1="50" y1="{height // 2}" x2="{progress_width}" y2="{height // 2}"
              stroke="{SUCCESS_GREEN}" stroke-width="4" stroke-linecap="round"/>
        '''

    # Draw milestones
    for i, milestone in enumerate(milestones):
        x = 50 + i * milestone_spacing

        # Status color
        if milestone["status"] == "complete":
            color = SUCCESS_GREEN
        elif milestone["status"] == "active":
            color = PRIMARY_BLUE
        else:
            color = GRAY_50

        # Milestone circle
        svg_content += f'''
        <circle cx="{x}" cy="{height // 2}" r="20" fill="{color}" filter="url(#shadow_light)"/>
        '''

        # Checkmark for complete
        if milestone["status"] == "complete":
            svg_content += f'''
            <path d="M{x - 7} {height // 2} l5 5 l9 -9" stroke="{WHITE}" stroke-width="3" fill="none"/>
            '''
        # Number for pending/active
        else:
            svg_content += f'''
            <text x="{x}" y="{height // 2 + 5}" text-anchor="middle"
                  font-family="Segoe UI" font-size="14" font-weight="600" fill="{WHITE}">{i + 1}</text>
            '''

        # Milestone name (above)
        name_lines = milestone["name"].split("\n")
        for j, line in enumerate(name_lines):
            svg_content += f'''
            <text class="milestone-name" x="{x}" y="{height // 2 - 40 + j * 14}">{line}</text>
            '''

        # Date (below)
        svg_content += f'''
        <text class="milestone-date" x="{x}" y="{height // 2 + 45}">{milestone["date"]}</text>
        '''

    # Legend
    svg_content += f'''
        <g transform="translate({width - 280}, {height - 30})">
            <circle cx="10" cy="0" r="8" fill="{SUCCESS_GREEN}"/>
            <text class="milestone-date" x="25" y="4" text-anchor="start">Complete</text>

            <circle cx="100" cy="0" r="8" fill="{PRIMARY_BLUE}"/>
            <text class="milestone-date" x="115" y="4" text-anchor="start">In Progress</text>

            <circle cx="200" cy="0" r="8" fill="{GRAY_50}"/>
            <text class="milestone-date" x="215" y="4" text-anchor="start">Pending</text>
        </g>
    '''

    svg_content += "</svg>"
    svg_content += f'''
        <g transform="translate({width - 280}, {height - 30})">
            <circle cx="10" cy="0" r="8" fill="{SUCCESS_GREEN}"/>
            <text class="milestone-date" x="25" y="4" text-anchor="start">Complete</text>

            <circle cx="100" cy="0" r="8" fill="{PRIMARY_BLUE}"/>
            <text class="milestone-date" x="115" y="4" text-anchor="start">In Progress</text>

            <circle cx="200" cy="0" r="8" fill="{GRAY_50}"/>
            <text class="milestone-date" x="215" y="4" text-anchor="start">Pending</text>
        </g>
    '''

    svg_content += "</svg>"
    return svg_content

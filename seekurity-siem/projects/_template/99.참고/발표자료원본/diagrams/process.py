"""
Process and Governance Diagram Generators
Professional SVG diagrams for workflows and organizational structures.
"""

from .colors import (
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


def create_implementation_phases(width: int = 900, height: int = 400) -> str:
    """
    Create a detailed implementation phases diagram with activities.

    Returns:
        SVG string for the implementation phases diagram
    """
    phases = [
        {
            "name": "Foundation",
            "number": "01",
            "color": TEAL,
            "activities": [
                "Environment Setup",
                "Network Validation",
                "Platform Install",
                "Health Check",
            ],
        },
        {
            "name": "Integration",
            "number": "02",
            "color": PRIMARY_BLUE,
            "activities": ["P1 Sources", "Parser Dev", "P2 Sources", "Validation"],
        },
        {
            "name": "Detection",
            "number": "03",
            "color": PURPLE,
            "activities": ["Use Cases", "Alert Config", "Dashboards", "Tuning"],
        },
        {
            "name": "Transition",
            "number": "04",
            "color": SECONDARY_BLUE,
            "activities": ["Documentation", "Training", "FVT", "Sign-off"],
        },
    ]

    phase_width = 200
    phase_height = 280

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .phase-number {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 36px; font-weight: 700; fill: {WHITE}; opacity: 0.3; }}
            .phase-name {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 18px; font-weight: 600; fill: {WHITE}; }}
            .activity {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {WHITE}; opacity: 0.9; }}
            .arrow {{ fill: {GRAY_40}; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>
    '''

    for i, phase in enumerate(phases):
        x = 30 + i * (phase_width + 25)

        # Main phase card
        svg_content += f'''
        <g transform="translate({x}, 40)">
            <!-- Card background -->
            <rect width="{phase_width}" height="{phase_height}" rx="12" fill="{phase["color"]}" filter="url(#shadow)"/>

            <!-- Phase number watermark -->
            <text class="phase-number" x="15" y="50">{phase["number"]}</text>

            <!-- Phase name -->
            <text class="phase-name" x="{phase_width // 2}" y="85" text-anchor="middle">{phase["name"]}</text>

            <!-- Divider line -->
            <line x1="20" y1="100" x2="{phase_width - 20}" y2="100" stroke="{WHITE}" stroke-width="1" opacity="0.3"/>

            <!-- Activities -->
        '''

        for j, activity in enumerate(phase["activities"]):
            svg_content += f'''
            <g transform="translate(20, {120 + j * 38})">
                <circle cx="8" cy="8" r="4" fill="{WHITE}" opacity="0.5"/>
                <text class="activity" x="20" y="12">{activity}</text>
            </g>
            '''

        svg_content += "</g>"

        # Arrow between phases
        if i < len(phases) - 1:
            arrow_x = x + phase_width + 2
            svg_content += f"""
            <g transform="translate({arrow_x}, 170)">
                <polygon class="arrow" points="0,10 15,10 15,0 25,15 15,30 15,20 0,20"/>
            </g>
            """

    # Bottom summary bar
    svg_content += f'''
        <g transform="translate(30, 340)">
            <rect width="840" height="45" rx="6" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>

            <g transform="translate(40, 15)">
                <text font-family="Segoe UI" font-size="11" fill="{GRAY_60}">Total Duration:</text>
                <text font-family="Segoe UI" font-size="13" font-weight="600" fill="{PRIMARY_BLUE}" x="95" y="0">[X] Weeks</text>
            </g>

            <g transform="translate(260, 15)">
                <text font-family="Segoe UI" font-size="11" fill="{GRAY_60}">Key Dependencies:</text>
                <text font-family="Segoe UI" font-size="13" font-weight="600" fill="{PRIMARY_BLUE}" x="110" y="0">Infrastructure, Access, Resources</text>
            </g>

            <g transform="translate(600, 15)">
                <text font-family="Segoe UI" font-size="11" fill="{GRAY_60}">Delivery Model:</text>
                <text font-family="Segoe UI" font-size="13" font-weight="600" fill="{PRIMARY_BLUE}" x="90" y="0">Agile / Iterative</text>
            </g>
        </g>
    '''

    svg_content += "</svg>"
    return svg_content


def create_governance_model(width: int = 900, height: int = 450) -> str:
    """
    Create a governance model diagram showing roles and escalation.

    Returns:
        SVG string for the governance model
    """
    return f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .role-title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 600; fill: {WHITE}; text-anchor: middle; }}
            .role-subtitle {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {WHITE}; text-anchor: middle; opacity: 0.8; }}
            .team-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: {GRAY_70}; }}
            .connector {{ stroke: {GRAY_40}; stroke-width: 2; fill: none; }}
            .connector-dashed {{ stroke: {GRAY_40}; stroke-width: 2; fill: none; stroke-dasharray: 6,3; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Seekurity Team Column -->
        <g transform="translate(50, 30)">
            <rect width="350" height="390" rx="8" fill="{PRIMARY_BLUE}" opacity="0.05" stroke="{PRIMARY_BLUE}" stroke-width="2"/>
            <text class="team-label" x="175" y="25" text-anchor="middle" fill="{PRIMARY_BLUE}">SEEKURITY</text>

            <!-- Project Sponsor -->
            <g transform="translate(100, 50)">
                <rect width="150" height="60" rx="6" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="role-title" x="75" y="28">Project Sponsor</text>
                <text class="role-subtitle" x="75" y="45">Executive Decisions</text>
            </g>

            <!-- Project Manager -->
            <g transform="translate(100, 140)">
                <rect width="150" height="60" rx="6" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="role-title" x="75" y="28">Project Manager</text>
                <text class="role-subtitle" x="75" y="45">Delivery & Reporting</text>
            </g>

            <!-- Technical Lead -->
            <g transform="translate(100, 230)">
                <rect width="150" height="60" rx="6" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="role-title" x="75" y="28">Technical Lead</text>
                <text class="role-subtitle" x="75" y="45">Architecture & Design</text>
            </g>

            <!-- Engineers -->
            <g transform="translate(50, 320)">
                <rect width="100" height="50" rx="6" fill="{TEAL}" filter="url(#shadow_light)"/>
                <text class="role-title" x="50" y="22" font-size="12">Engineer</text>
                <text class="role-subtitle" x="50" y="38">Implementation</text>
            </g>
            <g transform="translate(200, 320)">
                <rect width="100" height="50" rx="6" fill="{PURPLE}" filter="url(#shadow_light)"/>
                <text class="role-title" x="50" y="22" font-size="12">Analyst</text>
                <text class="role-subtitle" x="50" y="38">Use Cases</text>
            </g>

            <!-- Internal connectors -->
            <line class="connector" x1="175" y1="110" x2="175" y2="140"/>
            <line class="connector" x1="175" y1="200" x2="175" y2="230"/>
            <line class="connector" x1="175" y1="290" x2="100" y2="320"/>
            <line class="connector" x1="175" y1="290" x2="250" y2="320"/>
        </g>

        <!-- Customer Team Column -->
        <g transform="translate(500, 30)">
            <rect width="350" height="390" rx="8" fill="{SUCCESS_GREEN}" opacity="0.05" stroke="{SUCCESS_GREEN}" stroke-width="2"/>
            <text class="team-label" x="175" y="25" text-anchor="middle" fill="{SUCCESS_GREEN}">CUSTOMER</text>

            <!-- Project Sponsor -->
            <g transform="translate(100, 50)">
                <rect width="150" height="60" rx="6" fill="{SUCCESS_GREEN}" filter="url(#shadow_light)"/>
                <text class="role-title" x="75" y="28">Project Sponsor</text>
                <text class="role-subtitle" x="75" y="45">Budget & Approval</text>
            </g>

            <!-- Project Manager -->
            <g transform="translate(100, 140)">
                <rect width="150" height="60" rx="6" fill="{SUCCESS_GREEN}" filter="url(#shadow_light)" opacity="0.85"/>
                <text class="role-title" x="75" y="28">Project Manager</text>
                <text class="role-subtitle" x="75" y="45">Coordination</text>
            </g>

            <!-- Technical Lead -->
            <g transform="translate(100, 230)">
                <rect width="150" height="60" rx="6" fill="{SUCCESS_GREEN}" filter="url(#shadow_light)" opacity="0.7"/>
                <text class="role-title" x="75" y="28">Technical Lead</text>
                <text class="role-subtitle" x="75" y="45">Infrastructure</text>
            </g>

            <!-- Team Members -->
            <g transform="translate(50, 320)">
                <rect width="100" height="50" rx="6" fill="{CYAN}" filter="url(#shadow_light)"/>
                <text class="role-title" x="50" y="22" font-size="12">Security</text>
                <text class="role-subtitle" x="50" y="38">Requirements</text>
            </g>
            <g transform="translate(200, 320)">
                <rect width="100" height="50" rx="6" fill="{MAGENTA}" filter="url(#shadow_light)"/>
                <text class="role-title" x="50" y="22" font-size="12">IT Ops</text>
                <text class="role-subtitle" x="50" y="38">Access</text>
            </g>

            <!-- Internal connectors -->
            <line class="connector" x1="675" y1="110" x2="675" y2="140"/>
            <line class="connector" x1="675" y1="200" x2="675" y2="230"/>
            <line class="connector" x1="675" y1="290" x2="600" y2="320"/>
            <line class="connector" x1="675" y1="290" x2="750" y2="320"/>
        </g>

        <!-- Cross-team connectors (horizontal) -->
        <g>
            <!-- Sponsor level -->
            <line class="connector-dashed" x1="300" y1="110" x2="600" y2="110"/>
            <text font-family="Segoe UI" font-size="9" fill="{GRAY_50}" x="450" y="100" text-anchor="middle">Escalation</text>

            <!-- PM level -->
            <line class="connector" x1="300" y1="200" x2="600" y2="200"/>
            <text font-family="Segoe UI" font-size="9" fill="{GRAY_50}" x="450" y="190" text-anchor="middle">Weekly Status</text>

            <!-- Tech lead level -->
            <line class="connector" x1="300" y1="290" x2="600" y2="290"/>
            <text font-family="Segoe UI" font-size="9" fill="{GRAY_50}" x="450" y="280" text-anchor="middle">Daily Standup</text>
        </g>
    </svg>
    '''


def create_escalation_pyramid(width: int = 500, height: int = 350) -> str:
    """
    Create an escalation pyramid diagram.

    Returns:
        SVG string for the escalation pyramid
    """
    return f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .level-title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; font-weight: 600; fill: {WHITE}; text-anchor: middle; }}
            .level-time {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {WHITE}; text-anchor: middle; opacity: 0.8; }}
            .level-desc {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_60}; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Title -->
        <text font-family="Segoe UI" font-size="14" font-weight="600" fill="{GRAY_80}" x="250" y="25" text-anchor="middle">Escalation Path</text>

        <!-- Level 4 - Executive (top) -->
        <g transform="translate(175, 45)">
            <polygon points="75,0 150,60 0,60" fill="{ERROR_RED}" filter="url(#shadow_light)"/>
            <text class="level-title" x="75" y="35">Executive</text>
            <text class="level-time" x="75" y="50">P1: 8hr</text>
        </g>

        <!-- Level 3 - Management -->
        <g transform="translate(125, 100)">
            <polygon points="0,0 250,0 200,60 50,60" fill="{WARNING_YELLOW}" filter="url(#shadow_light)"/>
            <text class="level-title" x="125" y="35" fill="{GRAY_80}">Management</text>
            <text class="level-time" x="125" y="50" fill="{GRAY_70}">P1: 4hr | P2: 8hr</text>
        </g>

        <!-- Level 2 - Senior Engineer -->
        <g transform="translate(75, 155)">
            <polygon points="0,0 350,0 300,60 50,60" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
            <text class="level-title" x="175" y="35">Senior Engineer</text>
            <text class="level-time" x="175" y="50">P1: 2hr | P2: 4hr</text>
        </g>

        <!-- Level 1 - Support Engineer (base) -->
        <g transform="translate(25, 210)">
            <polygon points="0,0 450,0 400,60 50,60" fill="{TEAL}" filter="url(#shadow_light)"/>
            <text class="level-title" x="225" y="35">Support Engineer</text>
            <text class="level-time" x="225" y="50">Initial Response</text>
        </g>

        <!-- Side descriptions -->
        <g transform="translate(30, 290)">
            <rect width="200" height="50" rx="4" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>
            <text class="level-desc" x="10" y="20" font-weight="600">Response SLAs:</text>
            <text class="level-desc" x="10" y="35">P1: 1hr | P2: 4hr | P3: 8hr</text>
        </g>

        <g transform="translate(270, 290)">
            <rect width="200" height="50" rx="4" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>
            <text class="level-desc" x="10" y="20" font-weight="600">Resolution SLAs:</text>
            <text class="level-desc" x="10" y="35">P1: 4hr | P2: 8hr | P3: 24hr</text>
        </g>

        <!-- Vertical escalation arrow -->
        <g transform="translate(470, 100)">
            <line x1="0" y1="0" x2="0" y2="130" stroke="{GRAY_40}" stroke-width="2"/>
            <polygon points="0,0 -6,15 6,15" fill="{GRAY_40}"/>
            <text font-family="Segoe UI" font-size="9" fill="{GRAY_50}" transform="rotate(-90)" x="-80" y="-10">Escalation</text>
        </g>
    </svg>
    '''


def create_raci_matrix(width: int = 800, height: int = 400) -> str:
    """
    Create a RACI responsibility matrix.

    Returns:
        SVG string for the RACI matrix
    """
    activities = [
        ("Infrastructure Setup", ["I", "C", "R", "A", "C"]),
        ("Platform Installation", ["R", "A", "C", "I", "I"]),
        ("Log Source Config", ["R", "A", "C", "C", "I"]),
        ("Use Case Development", ["R", "A", "I", "C", "I"]),
        ("Training Delivery", ["R", "A", "I", "I", "C"]),
        ("FVT Execution", ["C", "I", "R", "A", "C"]),
        ("Sign-off", ["I", "I", "C", "R", "A"]),
    ]

    roles = [
        "Seekurity\nEngineer",
        "Seekurity\nPM",
        "Customer\nTech Lead",
        "Customer\nPM",
        "Customer\nSponsor",
    ]

    cell_width = 100
    cell_height = 40
    header_height = 60
    row_header_width = 180

    raci_colors = {
        "R": PRIMARY_BLUE,
        "A": SUCCESS_GREEN,
        "C": WARNING_YELLOW,
        "I": GRAY_50,
    }

    svg_content = f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .header {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; font-weight: 600; fill: {GRAY_70}; text-anchor: middle; }}
            .activity {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_80}; }}
            .raci {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 700; text-anchor: middle; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Title -->
        <text font-family="Segoe UI" font-size="14" font-weight="600" fill="{GRAY_80}" x="20" y="25">RACI Matrix</text>

        <!-- Column Headers -->
        <rect x="0" y="40" width="{width}" height="{header_height}" fill="{GRAY_10}"/>
    '''

    # Role headers
    for i, role in enumerate(roles):
        x = row_header_width + i * cell_width + cell_width // 2
        lines = role.split("\n")
        for j, line in enumerate(lines):
            svg_content += f'''
            <text class="header" x="{x}" y="{60 + j * 14}">{line}</text>
            '''

    # Activity rows
    for i, (activity, raci_values) in enumerate(activities):
        y = header_height + 50 + i * cell_height

        # Alternating row background
        if i % 2 == 0:
            svg_content += f'''
            <rect x="0" y="{y}" width="{width}" height="{cell_height}" fill="{GRAY_10}" opacity="0.5"/>
            '''

        # Activity name
        svg_content += f'''
        <text class="activity" x="20" y="{y + 25}">{activity}</text>
        '''

        # RACI values
        for j, value in enumerate(raci_values):
            x = row_header_width + j * cell_width + cell_width // 2
            color = raci_colors.get(value, GRAY_50)

            svg_content += f'''
            <circle cx="{x}" cy="{y + 20}" r="14" fill="{color}" opacity="0.2"/>
            <text class="raci" x="{x}" y="{y + 25}" fill="{color}">{value}</text>
            '''

    # Legend
    svg_content += f'''
        <g transform="translate(20, {height - 40})">
            <circle cx="10" cy="0" r="10" fill="{PRIMARY_BLUE}" opacity="0.2"/>
            <text class="raci" x="10" y="5" fill="{PRIMARY_BLUE}">R</text>
            <text font-family="Segoe UI" font-size="10" fill="{GRAY_60}" x="28" y="4">Responsible</text>

            <circle cx="130" cy="0" r="10" fill="{SUCCESS_GREEN}" opacity="0.2"/>
            <text class="raci" x="130" y="5" fill="{SUCCESS_GREEN}">A</text>
            <text font-family="Segoe UI" font-size="10" fill="{GRAY_60}" x="148" y="4">Accountable</text>

            <circle cx="260" cy="0" r="10" fill="{WARNING_YELLOW}" opacity="0.2"/>
            <text class="raci" x="260" y="5" fill="{GRAY_80}">C</text>
            <text font-family="Segoe UI" font-size="10" fill="{GRAY_60}" x="278" y="4">Consulted</text>

            <circle cx="380" cy="0" r="10" fill="{GRAY_50}" opacity="0.2"/>
            <text class="raci" x="380" y="5" fill="{GRAY_50}">I</text>
            <text font-family="Segoe UI" font-size="10" fill="{GRAY_60}" x="398" y="4">Informed</text>
        </g>
    '''

    svg_content += "</svg>"
    return svg_content

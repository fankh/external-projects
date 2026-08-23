"""
Architecture Diagram Generators
Professional SVG diagrams for SIEM architecture visualization.

Includes both:
- Full diagrams with embedded text (for static export)
- Background-only diagrams (for PowerPoint with editable text overlays)
"""

from .colors import (
    BLACK,
    CYAN,
    GRAY_10,
    GRAY_20,
    GRAY_30,
    GRAY_40,
    GRAY_50,
    GRAY_60,
    GRAY_70,
    GRAY_80,
    GRAY_100,
    LIGHT_BLUE,
    MAGENTA,
    PRIMARY_BLUE,
    PURPLE,
    SECONDARY_BLUE,
    SUCCESS_GREEN,
    TEAL,
    TERTIARY_BLUE,
    WHITE,
    get_gradient_defs,
)


def create_siem_architecture_diagram(width: int = 900, height: int = 500) -> str:
    """
    Create a comprehensive SIEM architecture diagram.

    Returns:
        SVG string for the architecture diagram
    """
    return f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 16px; font-weight: 600; fill: {GRAY_80}; }}
            .subtitle {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: {GRAY_50}; }}
            .label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 500; fill: {WHITE}; text-anchor: middle; }}
            .label-dark {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 500; fill: {GRAY_80}; text-anchor: middle; }}
            .layer-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; font-weight: 600; fill: {GRAY_70}; text-transform: uppercase; letter-spacing: 1px; }}
            .connector {{ stroke: {GRAY_30}; stroke-width: 2; fill: none; }}
            .connector-data {{ stroke: {PRIMARY_BLUE}; stroke-width: 2; fill: none; stroke-dasharray: 5,3; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Data Sources Layer -->
        <g transform="translate(20, 380)">
            <text class="layer-label" x="0" y="0">Data Sources</text>
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>

            <!-- Source boxes -->
            <g transform="translate(30, 30)">
                <rect width="100" height="50" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
                <text class="label" x="50" y="22">Firewall</text>
                <text class="subtitle" x="50" y="38" text-anchor="middle" fill="{WHITE}" opacity="0.8">Palo Alto</text>
            </g>
            <g transform="translate(150, 30)">
                <rect width="100" height="50" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
                <text class="label" x="50" y="22">EDR</text>
                <text class="subtitle" x="50" y="38" text-anchor="middle" fill="{WHITE}" opacity="0.8">CrowdStrike</text>
            </g>
            <g transform="translate(270, 30)">
                <rect width="100" height="50" rx="4" fill="{PURPLE}" filter="url(#shadow_light)"/>
                <text class="label" x="50" y="22">Identity</text>
                <text class="subtitle" x="50" y="38" text-anchor="middle" fill="{WHITE}" opacity="0.8">Azure AD</text>
            </g>
            <g transform="translate(390, 30)">
                <rect width="100" height="50" rx="4" fill="{CYAN}" filter="url(#shadow_light)"/>
                <text class="label" x="50" y="22">Cloud</text>
                <text class="subtitle" x="50" y="38" text-anchor="middle" fill="{WHITE}" opacity="0.8">AWS/Azure</text>
            </g>
            <g transform="translate(510, 30)">
                <rect width="100" height="50" rx="4" fill="{MAGENTA}" filter="url(#shadow_light)"/>
                <text class="label" x="50" y="22">Email</text>
                <text class="subtitle" x="50" y="38" text-anchor="middle" fill="{WHITE}" opacity="0.8">O365</text>
            </g>
            <g transform="translate(630, 30)">
                <rect width="100" height="50" rx="4" fill="{GRAY_70}" filter="url(#shadow_light)"/>
                <text class="label" x="50" y="22">Apps</text>
                <text class="subtitle" x="50" y="38" text-anchor="middle" fill="{WHITE}" opacity="0.8">Custom</text>
            </g>
            <g transform="translate(750, 30)">
                <rect width="80" height="50" rx="4" fill="{GRAY_50}" stroke="{GRAY_70}" stroke-width="1" stroke-dasharray="4,2"/>
                <text class="label-dark" x="40" y="30" fill="{GRAY_70}">+ More</text>
            </g>
        </g>

        <!-- Collection Layer -->
        <g transform="translate(20, 260)">
            <text class="layer-label" x="0" y="0">Collection Tier</text>
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{LIGHT_BLUE}" stroke="{TERTIARY_BLUE}" stroke-width="1"/>

            <g transform="translate(120, 25)">
                <rect width="180" height="55" rx="4" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="90" y="22">Log Collectors</text>
                <text class="subtitle" x="90" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Syslog / Agent / API</text>
            </g>
            <g transform="translate(340, 25)">
                <rect width="180" height="55" rx="4" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="90" y="22">Heavy Forwarders</text>
                <text class="subtitle" x="90" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Parse & Transform</text>
            </g>
            <g transform="translate(560, 25)">
                <rect width="180" height="55" rx="4" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="90" y="22">Load Balancer</text>
                <text class="subtitle" x="90" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">HA Distribution</text>
            </g>
        </g>

        <!-- Processing Layer -->
        <g transform="translate(20, 140)">
            <text class="layer-label" x="0" y="0">Processing Tier</text>
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{LIGHT_BLUE}" stroke="{PRIMARY_BLUE}" stroke-width="1"/>

            <g transform="translate(80, 25)">
                <rect width="200" height="55" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="100" y="22">Indexer Cluster</text>
                <text class="subtitle" x="100" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Index & Store Events</text>
            </g>
            <g transform="translate(330, 25)">
                <rect width="200" height="55" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="100" y="22">Correlation Engine</text>
                <text class="subtitle" x="100" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Rules & Analytics</text>
            </g>
            <g transform="translate(580, 25)">
                <rect width="200" height="55" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="100" y="22">Search Cluster</text>
                <text class="subtitle" x="100" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Distributed Search</text>
            </g>
        </g>

        <!-- Presentation Layer -->
        <g transform="translate(20, 20)">
            <text class="layer-label" x="0" y="0">Presentation Tier</text>
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>

            <g transform="translate(60, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="80" y="22">Dashboards</text>
                <text class="subtitle" x="80" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Real-time Views</text>
            </g>
            <g transform="translate(250, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="80" y="22">Alerts</text>
                <text class="subtitle" x="80" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Notifications</text>
            </g>
            <g transform="translate(440, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="80" y="22">Reports</text>
                <text class="subtitle" x="80" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Scheduled</text>
            </g>
            <g transform="translate(630, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="label" x="80" y="22">Investigation</text>
                <text class="subtitle" x="80" y="40" text-anchor="middle" fill="{WHITE}" opacity="0.8">Ad-hoc Search</text>
            </g>
        </g>

        <!-- Connectors -->
        <g class="connectors">
            <!-- Data sources to collectors -->
            <path class="connector-data" d="M450 380 L450 350"/>
            <polygon points="450,355 445,365 455,365" fill="{PRIMARY_BLUE}"/>

            <!-- Collectors to processing -->
            <path class="connector-data" d="M450 260 L450 230"/>
            <polygon points="450,235 445,245 455,245" fill="{PRIMARY_BLUE}"/>

            <!-- Processing to presentation -->
            <path class="connector-data" d="M450 140 L450 110"/>
            <polygon points="450,115 445,125 455,125" fill="{PRIMARY_BLUE}"/>
        </g>

        <!-- Data flow annotation -->
        <g transform="translate(780, 200)">
            <text class="subtitle" x="50" y="0" text-anchor="middle">Data Flow</text>
            <line x1="50" y1="10" x2="50" y2="80" stroke="{PRIMARY_BLUE}" stroke-width="2" stroke-dasharray="5,3"/>
            <polygon points="50,75 45,65 55,65" fill="{PRIMARY_BLUE}"/>
            <text class="subtitle" x="50" y="100" text-anchor="middle">[X] EPS</text>
        </g>
    </svg>
    '''


def create_siem_architecture_background(width: int = 900, height: int = 500) -> str:
    """
    Create SIEM architecture diagram with ONLY shapes (no text).
    Use this with PowerPoint editable text overlays.

    Returns:
        SVG string with shapes only (no text labels)
    """
    return f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Data Sources Layer -->
        <g transform="translate(20, 380)">
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>
            <!-- Source boxes (no text) -->
            <g transform="translate(30, 30)">
                <rect width="100" height="50" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(150, 30)">
                <rect width="100" height="50" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(270, 30)">
                <rect width="100" height="50" rx="4" fill="{PURPLE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(390, 30)">
                <rect width="100" height="50" rx="4" fill="{CYAN}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(510, 30)">
                <rect width="100" height="50" rx="4" fill="{MAGENTA}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(630, 30)">
                <rect width="100" height="50" rx="4" fill="{GRAY_70}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(750, 30)">
                <rect width="80" height="50" rx="4" fill="{GRAY_50}" stroke="{GRAY_70}" stroke-width="1" stroke-dasharray="4,2"/>
            </g>
        </g>

        <!-- Collection Layer -->
        <g transform="translate(20, 260)">
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{LIGHT_BLUE}" stroke="{TERTIARY_BLUE}" stroke-width="1"/>
            <g transform="translate(120, 25)">
                <rect width="180" height="55" rx="4" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(340, 25)">
                <rect width="180" height="55" rx="4" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(560, 25)">
                <rect width="180" height="55" rx="4" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
        </g>

        <!-- Processing Layer -->
        <g transform="translate(20, 140)">
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{LIGHT_BLUE}" stroke="{PRIMARY_BLUE}" stroke-width="1"/>
            <g transform="translate(80, 25)">
                <rect width="200" height="55" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(330, 25)">
                <rect width="200" height="55" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(580, 25)">
                <rect width="200" height="55" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
        </g>

        <!-- Presentation Layer -->
        <g transform="translate(20, 20)">
            <rect x="0" y="10" width="860" height="90" rx="6" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>
            <g transform="translate(60, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(250, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(440, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
            <g transform="translate(630, 25)">
                <rect width="160" height="55" rx="4" fill="{SECONDARY_BLUE}" filter="url(#shadow_light)"/>
            </g>
        </g>

        <!-- Connectors -->
        <g class="connectors">
            <path d="M450 380 L450 350" stroke="{PRIMARY_BLUE}" stroke-width="2" stroke-dasharray="5,3" fill="none"/>
            <polygon points="450,355 445,365 455,365" fill="{PRIMARY_BLUE}"/>
            <path d="M450 260 L450 230" stroke="{PRIMARY_BLUE}" stroke-width="2" stroke-dasharray="5,3" fill="none"/>
            <polygon points="450,235 445,245 455,245" fill="{PRIMARY_BLUE}"/>
            <path d="M450 140 L450 110" stroke="{PRIMARY_BLUE}" stroke-width="2" stroke-dasharray="5,3" fill="none"/>
            <polygon points="450,115 445,125 455,125" fill="{PRIMARY_BLUE}"/>
        </g>

        <!-- Data flow arrow -->
        <g transform="translate(780, 200)">
            <line x1="50" y1="10" x2="50" y2="80" stroke="{PRIMARY_BLUE}" stroke-width="2" stroke-dasharray="5,3"/>
            <polygon points="50,75 45,65 55,65" fill="{PRIMARY_BLUE}"/>
        </g>
    </svg>
    '''


def get_siem_architecture_text_positions(scale: float = 1.0):
    """
    Get text positions for SIEM architecture diagram editable overlays.

    Args:
        scale: Scale factor for positioning (1.0 = 900x500 base size)

    Returns:
        List of dicts with text label info: {text, subtitle, left, top, width, height, color}
    """
    # Base positions for 900x500 diagram, positions in inches at 12.5" width display
    # Scale factor: 12.5 / 900 = 0.01389 inches per pixel
    s = 12.5 / 900 * scale

    labels = [
        # Layer labels (left side)
        {
            "text": "PRESENTATION TIER",
            "left": 0.4 * s * 20,
            "top": 0.4 + s * 20,
            "width": 1.5,
            "height": 0.25,
            "color": "gray",
            "size": 9,
            "bold": True,
        },
        {
            "text": "PROCESSING TIER",
            "left": 0.4 + s * 20,
            "top": 0.4 + s * 140,
            "width": 1.5,
            "height": 0.25,
            "color": "gray",
            "size": 9,
            "bold": True,
        },
        {
            "text": "COLLECTION TIER",
            "left": 0.4 + s * 20,
            "top": 0.4 + s * 260,
            "width": 1.5,
            "height": 0.25,
            "color": "gray",
            "size": 9,
            "bold": True,
        },
        {
            "text": "DATA SOURCES",
            "left": 0.4 + s * 20,
            "top": 0.4 + s * 380,
            "width": 1.5,
            "height": 0.25,
            "color": "gray",
            "size": 9,
            "bold": True,
        },
        # Presentation tier boxes
        {
            "text": "Dashboards",
            "subtitle": "Real-time Views",
            "left": 0.4 + s * 80,
            "top": 0.4 + s * 45,
            "width": s * 160,
            "height": s * 55,
            "color": "white",
        },
        {
            "text": "Alerts",
            "subtitle": "Notifications",
            "left": 0.4 + s * 270,
            "top": 0.4 + s * 45,
            "width": s * 160,
            "height": s * 55,
            "color": "white",
        },
        {
            "text": "Reports",
            "subtitle": "Scheduled",
            "left": 0.4 + s * 460,
            "top": 0.4 + s * 45,
            "width": s * 160,
            "height": s * 55,
            "color": "white",
        },
        {
            "text": "Investigation",
            "subtitle": "Ad-hoc Search",
            "left": 0.4 + s * 650,
            "top": 0.4 + s * 45,
            "width": s * 160,
            "height": s * 55,
            "color": "white",
        },
        # Processing tier boxes
        {
            "text": "Indexer Cluster",
            "subtitle": "Index & Store Events",
            "left": 0.4 + s * 100,
            "top": 0.4 + s * 165,
            "width": s * 200,
            "height": s * 55,
            "color": "white",
        },
        {
            "text": "Correlation Engine",
            "subtitle": "Rules & Analytics",
            "left": 0.4 + s * 350,
            "top": 0.4 + s * 165,
            "width": s * 200,
            "height": s * 55,
            "color": "white",
        },
        {
            "text": "Search Cluster",
            "subtitle": "Distributed Search",
            "left": 0.4 + s * 600,
            "top": 0.4 + s * 165,
            "width": s * 200,
            "height": s * 55,
            "color": "white",
        },
        # Collection tier boxes
        {
            "text": "Log Collectors",
            "subtitle": "Syslog / Agent / API",
            "left": 0.4 + s * 140,
            "top": 0.4 + s * 285,
            "width": s * 180,
            "height": s * 55,
            "color": "white",
        },
        {
            "text": "Heavy Forwarders",
            "subtitle": "Parse & Transform",
            "left": 0.4 + s * 360,
            "top": 0.4 + s * 285,
            "width": s * 180,
            "height": s * 55,
            "color": "white",
        },
        {
            "text": "Load Balancer",
            "subtitle": "HA Distribution",
            "left": 0.4 + s * 580,
            "top": 0.4 + s * 285,
            "width": s * 180,
            "height": s * 55,
            "color": "white",
        },
        # Data source boxes
        {
            "text": "Firewall",
            "subtitle": "Palo Alto",
            "left": 0.4 + s * 50,
            "top": 0.4 + s * 410,
            "width": s * 100,
            "height": s * 50,
            "color": "white",
        },
        {
            "text": "EDR",
            "subtitle": "CrowdStrike",
            "left": 0.4 + s * 170,
            "top": 0.4 + s * 410,
            "width": s * 100,
            "height": s * 50,
            "color": "white",
        },
        {
            "text": "Identity",
            "subtitle": "Azure AD",
            "left": 0.4 + s * 290,
            "top": 0.4 + s * 410,
            "width": s * 100,
            "height": s * 50,
            "color": "white",
        },
        {
            "text": "Cloud",
            "subtitle": "AWS/Azure",
            "left": 0.4 + s * 410,
            "top": 0.4 + s * 410,
            "width": s * 100,
            "height": s * 50,
            "color": "white",
        },
        {
            "text": "Email",
            "subtitle": "O365",
            "left": 0.4 + s * 530,
            "top": 0.4 + s * 410,
            "width": s * 100,
            "height": s * 50,
            "color": "white",
        },
        {
            "text": "Apps",
            "subtitle": "Custom",
            "left": 0.4 + s * 650,
            "top": 0.4 + s * 410,
            "width": s * 100,
            "height": s * 50,
            "color": "white",
        },
        {
            "text": "+ More",
            "left": 0.4 + s * 770,
            "top": 0.4 + s * 410,
            "width": s * 80,
            "height": s * 50,
            "color": "gray",
        },
        # Data flow label
        {
            "text": "Data Flow",
            "left": 0.4 + s * 800,
            "top": 0.4 + s * 200,
            "width": s * 80,
            "height": 0.2,
            "color": "gray",
            "size": 9,
        },
        {
            "text": "[X] EPS",
            "left": 0.4 + s * 800,
            "top": 0.4 + s * 300,
            "width": s * 80,
            "height": 0.2,
            "color": "gray",
            "size": 9,
        },
    ]

    return labels


def create_network_topology_diagram(width: int = 800, height: int = 450) -> str:
    """
    Create a network topology diagram showing SIEM deployment zones.

    Returns:
        SVG string for the network topology
    """
    return f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .zone-title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: {GRAY_70}; }}
            .node-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_80}; text-anchor: middle; }}
            .connector {{ stroke: {GRAY_40}; stroke-width: 2; fill: none; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- DMZ Zone -->
        <g transform="translate(20, 20)">
            <rect width="180" height="410" rx="6" fill="{TEAL}" opacity="0.1" stroke="{TEAL}" stroke-width="2" stroke-dasharray="8,4"/>
            <text class="zone-title" x="90" y="25" text-anchor="middle" fill="{TEAL}">DMZ</text>

            <!-- Web servers -->
            <g transform="translate(40, 60)">
                <rect width="100" height="60" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
                <text class="node-label" x="50" y="35" fill="{WHITE}">Web Server</text>
            </g>
            <g transform="translate(40, 140)">
                <rect width="100" height="60" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
                <text class="node-label" x="50" y="35" fill="{WHITE}">Proxy</text>
            </g>
            <g transform="translate(40, 220)">
                <rect width="100" height="60" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
                <text class="node-label" x="50" y="35" fill="{WHITE}">Mail Gateway</text>
            </g>
            <g transform="translate(40, 300)">
                <rect width="100" height="60" rx="4" fill="{TEAL}" filter="url(#shadow_light)"/>
                <text class="node-label" x="50" y="35" fill="{WHITE}">VPN</text>
            </g>
        </g>

        <!-- Corporate Network Zone -->
        <g transform="translate(220, 20)">
            <rect width="360" height="410" rx="6" fill="{PRIMARY_BLUE}" opacity="0.1" stroke="{PRIMARY_BLUE}" stroke-width="2" stroke-dasharray="8,4"/>
            <text class="zone-title" x="180" y="25" text-anchor="middle" fill="{PRIMARY_BLUE}">Corporate Network</text>

            <!-- SIEM Components -->
            <g transform="translate(20, 60)">
                <rect width="140" height="80" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="node-label" x="70" y="35" fill="{WHITE}">SIEM</text>
                <text class="node-label" x="70" y="55" fill="{WHITE}" opacity="0.8">Search Head</text>
            </g>
            <g transform="translate(20, 160)">
                <rect width="140" height="80" rx="4" fill="{PRIMARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="node-label" x="70" y="35" fill="{WHITE}">SIEM</text>
                <text class="node-label" x="70" y="55" fill="{WHITE}" opacity="0.8">Indexer Cluster</text>
            </g>
            <g transform="translate(20, 260)">
                <rect width="140" height="80" rx="4" fill="{TERTIARY_BLUE}" filter="url(#shadow_light)"/>
                <text class="node-label" x="70" y="35" fill="{WHITE}">SIEM</text>
                <text class="node-label" x="70" y="55" fill="{WHITE}" opacity="0.8">Collectors</text>
            </g>

            <!-- Internal systems -->
            <g transform="translate(200, 60)">
                <rect width="140" height="60" rx="4" fill="{PURPLE}" filter="url(#shadow_light)"/>
                <text class="node-label" x="70" y="35" fill="{WHITE}">Domain Controllers</text>
            </g>
            <g transform="translate(200, 140)">
                <rect width="140" height="60" rx="4" fill="{PURPLE}" filter="url(#shadow_light)"/>
                <text class="node-label" x="70" y="35" fill="{WHITE}">File Servers</text>
            </g>
            <g transform="translate(200, 220)">
                <rect width="140" height="60" rx="4" fill="{CYAN}" filter="url(#shadow_light)"/>
                <text class="node-label" x="70" y="35" fill="{WHITE}">Workstations</text>
            </g>
            <g transform="translate(200, 300)">
                <rect width="140" height="60" rx="4" fill="{MAGENTA}" filter="url(#shadow_light)"/>
                <text class="node-label" x="70" y="35" fill="{WHITE}">Applications</text>
            </g>
        </g>

        <!-- Secure Zone -->
        <g transform="translate(600, 20)">
            <rect width="180" height="410" rx="6" fill="{SUCCESS_GREEN}" opacity="0.1" stroke="{SUCCESS_GREEN}" stroke-width="2" stroke-dasharray="8,4"/>
            <text class="zone-title" x="90" y="25" text-anchor="middle" fill="{SUCCESS_GREEN}">Secure Zone</text>

            <g transform="translate(40, 60)">
                <rect width="100" height="60" rx="4" fill="{SUCCESS_GREEN}" filter="url(#shadow_light)"/>
                <text class="node-label" x="50" y="35" fill="{WHITE}">Database</text>
            </g>
            <g transform="translate(40, 140)">
                <rect width="100" height="60" rx="4" fill="{SUCCESS_GREEN}" filter="url(#shadow_light)"/>
                <text class="node-label" x="50" y="35" fill="{WHITE}">Backup</text>
            </g>
            <g transform="translate(40, 220)">
                <rect width="100" height="60" rx="4" fill="{SUCCESS_GREEN}" filter="url(#shadow_light)"/>
                <text class="node-label" x="50" y="35" fill="{WHITE}">PAM</text>
            </g>
        </g>

        <!-- Firewall icons -->
        <g transform="translate(195, 200)">
            <rect width="30" height="50" rx="2" fill="{GRAY_80}"/>
            <text class="node-label" x="15" y="70" fill="{GRAY_70}">FW</text>
        </g>
        <g transform="translate(575, 200)">
            <rect width="30" height="50" rx="2" fill="{GRAY_80}"/>
            <text class="node-label" x="15" y="70" fill="{GRAY_70}">FW</text>
        </g>

        <!-- Connection lines -->
        <line x1="140" y1="225" x2="195" y2="225" stroke="{GRAY_40}" stroke-width="2"/>
        <line x1="225" y1="225" x2="240" y2="225" stroke="{GRAY_40}" stroke-width="2"/>
        <line x1="580" y1="225" x2="575" y2="225" stroke="{GRAY_40}" stroke-width="2"/>
        <line x1="605" y1="225" x2="640" y2="225" stroke="{GRAY_40}" stroke-width="2"/>
    </svg>
    '''


def create_data_flow_diagram(width: int = 900, height: int = 350) -> str:
    """
    Create a data flow diagram showing log ingestion pipeline.

    Returns:
        SVG string for the data flow diagram
    """
    return f'''
    <svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
        {get_gradient_defs()}
        <style>
            .stage-title {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 600; fill: {WHITE}; text-anchor: middle; }}
            .stage-subtitle {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {WHITE}; text-anchor: middle; opacity: 0.8; }}
            .arrow {{ fill: {GRAY_40}; }}
            .flow-label {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: {GRAY_60}; text-anchor: middle; }}
            .metric {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: {PRIMARY_BLUE}; text-anchor: middle; }}
        </style>

        <!-- Background -->
        <rect width="{width}" height="{height}" fill="{WHITE}" rx="8"/>

        <!-- Stage 1: Sources -->
        <g transform="translate(30, 80)">
            <rect width="120" height="150" rx="8" fill="{TEAL}" filter="url(#shadow)"/>
            <text class="stage-title" x="60" y="40">Sources</text>
            <line x1="20" y1="55" x2="100" y2="55" stroke="{WHITE}" stroke-width="1" opacity="0.3"/>
            <text class="stage-subtitle" x="60" y="80">Firewall</text>
            <text class="stage-subtitle" x="60" y="98">EDR</text>
            <text class="stage-subtitle" x="60" y="116">Identity</text>
            <text class="stage-subtitle" x="60" y="134">Cloud</text>
        </g>

        <!-- Arrow 1 -->
        <g transform="translate(160, 145)">
            <polygon class="arrow" points="0,10 40,10 40,0 60,15 40,30 40,20 0,20"/>
            <text class="flow-label" x="30" y="50">Raw Logs</text>
            <text class="metric" x="30" y="65">[X] EPS</text>
        </g>

        <!-- Stage 2: Collection -->
        <g transform="translate(230, 80)">
            <rect width="120" height="150" rx="8" fill="{TERTIARY_BLUE}" filter="url(#shadow)"/>
            <text class="stage-title" x="60" y="40">Collection</text>
            <line x1="20" y1="55" x2="100" y2="55" stroke="{WHITE}" stroke-width="1" opacity="0.3"/>
            <text class="stage-subtitle" x="60" y="80">Syslog</text>
            <text class="stage-subtitle" x="60" y="98">API Pull</text>
            <text class="stage-subtitle" x="60" y="116">Agent</text>
            <text class="stage-subtitle" x="60" y="134">Forwarder</text>
        </g>

        <!-- Arrow 2 -->
        <g transform="translate(360, 145)">
            <polygon class="arrow" points="0,10 40,10 40,0 60,15 40,30 40,20 0,20"/>
            <text class="flow-label" x="30" y="50">Parsed</text>
            <text class="metric" x="30" y="65">[X] EPS</text>
        </g>

        <!-- Stage 3: Processing -->
        <g transform="translate(430, 80)">
            <rect width="120" height="150" rx="8" fill="{PRIMARY_BLUE}" filter="url(#shadow)"/>
            <text class="stage-title" x="60" y="40">Processing</text>
            <line x1="20" y1="55" x2="100" y2="55" stroke="{WHITE}" stroke-width="1" opacity="0.3"/>
            <text class="stage-subtitle" x="60" y="80">Normalize</text>
            <text class="stage-subtitle" x="60" y="98">Enrich</text>
            <text class="stage-subtitle" x="60" y="116">Correlate</text>
            <text class="stage-subtitle" x="60" y="134">Index</text>
        </g>

        <!-- Arrow 3 -->
        <g transform="translate(560, 145)">
            <polygon class="arrow" points="0,10 40,10 40,0 60,15 40,30 40,20 0,20"/>
            <text class="flow-label" x="30" y="50">Indexed</text>
            <text class="metric" x="30" y="65">[X] GB/day</text>
        </g>

        <!-- Stage 4: Storage -->
        <g transform="translate(630, 80)">
            <rect width="120" height="150" rx="8" fill="{SECONDARY_BLUE}" filter="url(#shadow)"/>
            <text class="stage-title" x="60" y="40">Storage</text>
            <line x1="20" y1="55" x2="100" y2="55" stroke="{WHITE}" stroke-width="1" opacity="0.3"/>
            <text class="stage-subtitle" x="60" y="80">Hot: 7 days</text>
            <text class="stage-subtitle" x="60" y="98">Warm: 30 days</text>
            <text class="stage-subtitle" x="60" y="116">Cold: 90 days</text>
            <text class="stage-subtitle" x="60" y="134">Archive: 1 yr</text>
        </g>

        <!-- Arrow 4 -->
        <g transform="translate(760, 145)">
            <polygon class="arrow" points="0,10 40,10 40,0 60,15 40,30 40,20 0,20"/>
            <text class="flow-label" x="30" y="50">Query</text>
        </g>

        <!-- Stage 5: Analysis -->
        <g transform="translate(830, 80)">
            <rect width="50" height="150" rx="8" fill="{PURPLE}" filter="url(#shadow)"/>
            <text class="stage-title" x="25" y="85" transform="rotate(-90, 25, 85)">Analysis</text>
        </g>

        <!-- Bottom metrics bar -->
        <g transform="translate(30, 270)">
            <rect width="850" height="60" rx="6" fill="{GRAY_10}" stroke="{GRAY_20}" stroke-width="1"/>
            <g transform="translate(50, 20)">
                <text class="flow-label" x="0" y="0">Total Sources</text>
                <text class="metric" x="0" y="20">[X]</text>
            </g>
            <g transform="translate(200, 20)">
                <text class="flow-label" x="0" y="0">Avg Latency</text>
                <text class="metric" x="0" y="20">&lt;30s</text>
            </g>
            <g transform="translate(350, 20)">
                <text class="flow-label" x="0" y="0">Parse Rate</text>
                <text class="metric" x="0" y="20">&gt;95%</text>
            </g>
            <g transform="translate(500, 20)">
                <text class="flow-label" x="0" y="0">Daily Volume</text>
                <text class="metric" x="0" y="20">[X] GB</text>
            </g>
            <g transform="translate(650, 20)">
                <text class="flow-label" x="0" y="0">Retention</text>
                <text class="metric" x="0" y="20">[X] Days</text>
            </g>
            <g transform="translate(800, 20)">
                <text class="flow-label" x="0" y="0">Uptime</text>
                <text class="metric" x="0" y="20">99.9%</text>
            </g>
        </g>
    </svg>
    '''

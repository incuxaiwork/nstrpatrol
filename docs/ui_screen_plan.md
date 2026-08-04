# UI/UX Design Specification - Patrol & Field Reporting Application

## 1. Global Design System (Government / Neutral Theme)

Given the context of a government project, the design language focuses on accessibility, clarity, and reliability. The color palette uses neutral, natural tones to reduce eye strain for field workers and maintain an official, serious tone.

### 1.1. Color Palette
*   **Primary Color:** Dark Forest Green (`#1E4620`) or Navy Blue (`#1B365D`) – Used for primary app bars, main actions, and active navigation states.
*   **Secondary Color:** Khaki / Sand (`#C3B091`) or Slate Blue (`#4A6572`) – Used for secondary buttons or highlights.
*   **Background / Surface:** Off-White (`#F8F9FA`) for the main app background to reduce harsh contrast; Pure White (`#FFFFFF`) for cards and input fields.
*   **Text (Primary):** Dark Charcoal (`#212121`) for high legibility.
*   **Text (Secondary):** Cool Gray (`#757575`) for labels, timestamps, and placeholders.
*   **Alert/Status Colors:**
    *   **Error/SOS:** Muted Red (`#B3261E`)
    *   **Success:** Leaf Green (`#2E7D32`)
    *   **Warning:** Amber (`#FF8F00`)

### 1.2. Typography & Spacing
*   **Font:** A clean, standard sans-serif (e.g., Roboto, Open Sans, or system default).
*   **Spacing:** Base unit of 8px. 
    *   Screen margins: 16px.
    *   Card padding: 16px.
    *   Element spacing (between inputs/buttons): 12px - 16px.
*   **Card Styling:** Flat design with a very subtle drop shadow (e.g., `box-shadow: 0 1px 3px rgba(0,0,0,0.12)`), border radius of 8px. Avoid heavy gradients or complex layered shadows.

---

## 2. Screen Definitions based on Wireframes (IMG_0109.jpg)

### 2.1. Screen 1: Login Screen
*   **Purpose:** Secure entry point for the field officer/staff.
*   **Layout:** Centered, vertical stack.
*   **UI Components:**
    *   **App Logo/Title:** "Login" (Centered, Large Typography, Primary Color).
    *   **Input Field 1 - Username:** Standard text field. Full width (minus margins), white background, subtle gray border. Label "User name".
    *   **Input Field 2 - Password:** Masked text field. Full width, matches username field styling. Label "Password".
    *   **Action Button - Submit:** Full width, filled primary color (Dark Green/Navy), white text. Placed 24px below the password field.

### 2.2. Screen 2: Dashboard
*   **Purpose:** Central hub for the user's active duty, providing key metrics and quick actions.
*   **Layout:** Scrollable vertical list with a fixed bottom navigation bar.
*   **UI Components:**
    *   **Header Card (Assigned Patrol):**
        *   *Style:* Large top card, primary background with white text, or white card with a prominent primary color border.
        *   *Data Points:* Name, Area, Boundary.
    *   **Metrics Row:**
        *   *Layout:* Two square or rectangular cards placed side-by-side (50% width each, 8px gap).
        *   *Card 1:* "Total dist. covered" (Highlight numerical value).
        *   *Card 2:* "Patrol duration" (Highlight time metric).
    *   **List Card (Recent Logs / Alerts):**
        *   *Style:* Wide rectangular card spanning full width.
        *   *Content:* Scrollable mini-list of latest system alerts or recently synced logs.
    *   **Grid Section (Quick Actions):**
        *   *Layout:* 3x2 grid of square buttons/cards.
        *   *Mapping (per sketch notes):*
            1.  **Start Patrol:** (Play icon, primary color).
            2.  **Sync Queue:** (Sync/Cloud icon).
            3.  **SOS:** (Emergency shield/bell icon, styled with the Muted Red alert color).
            4.  **Quick Capture:** (Camera icon).
            5.  *(Unassigned/Future Use)*
            6.  *(Unassigned/Future Use)*
    *   **Bottom Navigation Bar:**
        *   *Style:* Fixed at bottom, white background, icons with text labels below.
        *   *Items:* Home (Active), Maps, Reports, Settings, Sync, Photos.

### 2.3. Screen 3: Reports Screen
*   **Purpose:** Detailed data entry for field observations (e.g., wildlife, environmental factors).
*   **Layout:** Two distinct sections (Category Grid followed by a Data Entry Form).
*   **UI Components:**
    *   **Top Section - Category Grid:**
        *   *Layout:* Grid of selectable square cards (e.g., 3 columns). When a category is tapped, it highlights (active state).
        *   *Mapping (per sketch notes):*
            1.  **Human impact**
            2.  **Animal mortality details**
            3.  **Direct & indirect sighting of tigers**
            4.  **Water source details**
            5.  *(Additional categories as needed)*
    *   **Bottom Section - Entry Form:**
        *   *Field 1 - Severity:* Dropdown or segmented control (Low, Medium, High).
        *   *Field 2 - Description:* Large text area (multi-line, approx. 4-5 lines tall).
        *   *Field 3 - Add Photo:* A wide upload area/button. Can feature a dashed border indicating a drop/tap zone for media capture.
        *   *Field 4 - Captured details:* Read-only or auto-populated fields (e.g., GPS coordinates, timestamp, automatically derived from the device context).

---

## 3. Navigation & Flow
*   **Login -> Dashboard:** Upon successful authentication, the user is routed to the Dashboard.
*   **Dashboard -> Reports:** Accessible via the "Reports" icon in the Bottom Navigation Bar, or triggered contextually via a "Quick Action" (like Quick Capture).
*   **Global Access:** The bottom navigation bar must persist across all main screens (except Login and full-screen camera modes) to allow rapid context switching between Home, Maps, and Reports.

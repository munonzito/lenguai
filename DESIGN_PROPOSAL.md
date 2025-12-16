# LenguAI Design Proposal: "Immersive Storybook"

Based on the research of modern language learning apps and visual novel interfaces, I propose a design overhaul that shifts from the current "Dark Sci-Fi" aesthetic to a cleaner, more inviting "Immersive Storybook" style.

## Core Concept
The app is a "Visual Novel Language Tutor". The interface should feel like an interactive window into a story, not just a tool. It should be friendly (like Duolingo) but immersive (like a game).

## Visual Identity & Branding

### Color Palette ("Intellectual Adventure")
- **Primary**: **Deep Indigo** (`#4F46E5`) - For main branding and primary actions.
- **Secondary**: **Warm Teal** (`#14B8A6`) - For success states and accents.
- **Background/Surface**: **Paper White** (`#F9FAFB`) with **Frosted Glass** effects.
- **Text**: **Slate** (`#1E293B`) for high contrast readability (instead of white on black).
- **Accent**: **Amber/Gold** (`#F59E0B`) for gamification elements (points, streaks).

### Typography
- **Headings (UI)**: **'Nunito'** (Rounded Sans-Serif) - Friendly, approachable, modern.
- **Body (Story Text)**: **'Lora'** or **'Merriweather'** (Serif) - Legible, evokes a "book" feel, high readability for long text.

## UI Layout Improvements

### 1. The Stage (Background)
- Maintain the full-screen dynamic background.
- **Improvement**: Add a subtle vignette or gradient overlay *only at the bottom* to ensure text legibility without darkening the whole image.

### 2. The Narrative Box (Dialogue)
- **Current**: Dark, boxy, floating.
- **Proposed**: 
    - A **"Frosted Glass" panel** at the bottom of the screen (full width or wide rounded card).
    - **Light Mode**: White/Glass background with dark text is often more readable for long reading sessions than high-contrast dark mode.
    - **Speaker Label**: Clearly distinguished "Tutor" label (maybe with a small avatar/icon).
    - **Typing Effect**: Text should appear letter-by-letter (optional toggle) to mimic speaking.

### 3. Interaction Area (Choices)
- **Current**: List of text buttons.
- **Proposed**: 
    - **Speech Bubbles**: Style the options as things the *user* would say.
    - **Floating Action Cards**: Place them above the text box or integrated into the right side.
    - **Icons**: Add small icons to choices (e.g., "Market" -> 🛒 icon).

### 4. Voice Interaction
- **Current**: Large isolated button.
- **Proposed**: Integrate the microphone button into the "Input Bar". Make it pulse gently when it's the user's turn to speak.

## Implementation Plan

1.  **Install Fonts**: Add Nunito and Lora via Nuxt/Google Fonts.
2.  **Update Tailwind Config**: Define the new color palette.
3.  **Refactor `app.vue`**:
    - Rebuild the main container structure.
    - Create a separate `<DialogueBox />` component.
    - Create a `<ChoiceButton />` component.
    - Apply the new "Glassmorphism" styles.

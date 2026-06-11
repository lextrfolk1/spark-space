export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                canvas: "var(--color-canvas)",
                panel: "var(--color-panel)",
                accent: "var(--color-accent)",
                ink: "var(--color-ink)",
                muted: "var(--color-muted)",
                border: "var(--color-border)",
            },
            fontFamily: {
                display: ["'Inter'", "sans-serif"],
                body: ["'Inter'", "sans-serif"],
                mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "monospace"],
            },
            boxShadow: {
                panel: "0 18px 60px rgba(15, 23, 42, 0.18)",
            },
        },
    },
    plugins: [],
};

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from "@/components/providers/theme-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function TestConsumer() {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme("light")}>
        Set Light
      </button>
      <button data-testid="set-dark-btn" onClick={() => setTheme("dark")}>
        Set Dark
      </button>
    </div>
  );
}

describe("Theme System (Light Mode Azure Theme & Dark Mode)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark theme when no stored preference exists", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    const themeDisplay = screen.getByTestId("current-theme");
    expect(themeDisplay.textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("restores light theme from localStorage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    const themeDisplay = screen.getByTestId("current-theme");
    expect(themeDisplay.textContent).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggles between dark and light themes and updates DOM and localStorage", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    const toggleBtn = screen.getByTestId("toggle-btn");
    const themeDisplay = screen.getByTestId("current-theme");

    // Initially dark
    expect(themeDisplay.textContent).toBe("dark");

    // Toggle to light
    act(() => {
      fireEvent.click(toggleBtn);
    });

    expect(themeDisplay.textContent).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // Toggle back to dark
    act(() => {
      fireEvent.click(toggleBtn);
    });

    expect(themeDisplay.textContent).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("ThemeToggle button renders and triggers toggle", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole("button", { name: /switch to light mode/i });
    expect(button).toBeDefined();

    act(() => {
      fireEvent.click(button);
    });

    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeDefined();
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});

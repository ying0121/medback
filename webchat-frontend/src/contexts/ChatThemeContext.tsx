import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getColorModeFromCookie, setColorModeCookie } from "@/lib/chatCookies";
import {
  applyChatThemeToWidget,
  DEFAULT_THEME_COLOR_ID,
  normalizeThemeColorId,
  type ColorMode,
  type ThemeColorId,
} from "@/lib/chatThemes";

type ChatThemeContextValue = {
  themeId: ThemeColorId;
  colorMode: ColorMode;
  isThemeFromBackend: boolean;
  setThemeFromBackend: (rawThemeColor: string | undefined | null) => void;
  toggleColorMode: () => void;
  setColorMode: (mode: ColorMode) => void;
};

const ChatThemeContext = createContext<ChatThemeContextValue | null>(null);

export const ChatThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeId] = useState<ThemeColorId>(DEFAULT_THEME_COLOR_ID);
  const [colorMode, setColorModeState] = useState<ColorMode>(() => getColorModeFromCookie());
  const [isThemeFromBackend, setIsThemeFromBackend] = useState(false);
  const themeIdRef = useRef(themeId);
  const colorModeRef = useRef(colorMode);

  themeIdRef.current = themeId;
  colorModeRef.current = colorMode;

  useEffect(() => {
    applyChatThemeToWidget(themeId, colorMode);
  }, [colorMode, themeId]);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    setColorModeCookie(mode);
    applyChatThemeToWidget(themeIdRef.current, mode);
  }, []);

  const toggleColorMode = useCallback(() => {
    setColorModeState((prev) => {
      const next: ColorMode = prev === "dark" ? "light" : "dark";
      setColorModeCookie(next);
      applyChatThemeToWidget(themeIdRef.current, next);
      return next;
    });
  }, []);

  const setThemeFromBackend = useCallback((rawThemeColor: string | undefined | null) => {
    const next = normalizeThemeColorId(rawThemeColor);
    setThemeId(next);
    setIsThemeFromBackend(true);
    applyChatThemeToWidget(next, colorModeRef.current);
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      colorMode,
      isThemeFromBackend,
      setThemeFromBackend,
      toggleColorMode,
      setColorMode,
    }),
    [themeId, colorMode, isThemeFromBackend, setThemeFromBackend, toggleColorMode, setColorMode],
  );

  return <ChatThemeContext.Provider value={value}>{children}</ChatThemeContext.Provider>;
};

export const useChatTheme = (): ChatThemeContextValue => {
  const ctx = useContext(ChatThemeContext);
  if (!ctx) {
    throw new Error("useChatTheme must be used within ChatThemeProvider");
  }
  return ctx;
};

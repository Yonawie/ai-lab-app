import { routes } from "@/shared/routes";

/**
 * Единая ссылка на экран «Арена ИИ» (дуэли + проверка двух ответов).
 * Arena живёт на собственном пути, но использует тот же экран, что и Compare:
 * Compare = одна точечная проверка, Arena = проверка на задачах и матчи моделей.
 */
export const studentArenaScreenPath = routes.studentArena;

"use client";

import { createContext, useContext } from "react";

import type { Board } from "./use-task-board";

export const BoardContext = createContext<Board | null>(null);

export function useBoard() {
  const board = useContext(BoardContext);

  if (!board) {
    throw new Error("useBoard must be used inside BoardContext.Provider");
  }

  return board;
}

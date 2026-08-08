---
name: andrej-karpathy-skills
description: "Behavioral guidelines for AI coding agents based on Andrej Karpathy's principles. Use to enforce simplicity, think before coding, perform surgical changes, and drive goal-driven execution."
category: guidelines
risk: safe
source: local
version: "1.0.0"
tags: [karpathy, coding-principles, simplicity, clean-code, guardrails]
---

# Andrej Karpathy Coding Principles & Guidelines

This skill enforces high-discipline coding behaviors designed to minimize errors, avoid over-engineering, and prevent scope creep.

## Core Principles

### 1. Think Before Coding (Suy nghĩ trước khi Code)
*   **Stated Assumptions**: Explicitly state your assumptions before making changes.
*   **No Confusion**: If the requirements are ambiguous or you find yourself guessing the user's intent, stop and ask the user for clarification.
*   **Trace Inputs & Outputs**: Verify the data structures and flow before writing any code.

### 2. Simplicity First (Ưu tiên sự tối giản)
*   **Minimum Viable Code**: Write only the minimum amount of code necessary to solve the problem.
*   **No Speculative Abstractions**: Do not build abstractions, generic frameworks, or "flexible" systems for hypothetical future requirements. Only solve the current problem.
*   **Avoid External Dependencies**: Prefer clean, vanilla code over adding new packages unless explicitly requested.

### 3. Surgical Changes (Chỉnh sửa chính xác như phẫu thuật)
*   **Locality of Changes**: Modify only the files and lines that are strictly necessary to address the request.
*   **No Unrelated Improvements**: Do not refactor or "clean up" adjacent or neighboring code unless requested. Refactoring unrelated code introduces regressions.
*   **Preserve Comments & Formatting**: Keep existing formatting, docstrings, and unrelated comments intact.

### 4. Goal-Driven Execution (Thực thi theo mục tiêu)
*   **Verifiable Targets**: Break down the task into concrete, testable targets before starting.
*   **Test-First Mindset**: Whenever possible, write or run a test to reproduce a bug before fixing it, and verify the fix by running the test.
*   **Check After Changes**: Run linters, type checks, and test suites immediately after code changes to ensure correctness.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const bulkApproveMock = vi.fn();
const revertMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/app/actions/claims", () => ({
  bulkApproveCategoryAction: (fd: FormData) => bulkApproveMock(fd),
  revertClaimsByCategoryAction: (fd: FormData) => revertMock(fd),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (msg: string, opts?: Record<string, unknown>) => toastSuccessMock(msg, opts),
    error: (msg: string) => toastErrorMock(msg),
  },
}));

import { BulkApproveBar } from "@/components/dreams/BulkApproveBar";

afterEach(() => {
  vi.clearAllMocks();
});

describe("BulkApproveBar Sonner Undo wiring", () => {
  it("calls the bulk approve action then registers an Undo handler that reverts", async () => {
    bulkApproveMock.mockResolvedValue(3);
    revertMock.mockResolvedValue(3);

    render(<BulkApproveBar runId="r1" category="merged" pendingCount={3} />);
    const btn = screen.getByRole("button", { name: /approve all 3/i });
    fireEvent.click(btn);

    // Let the promise + transition resolve.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(bulkApproveMock).toHaveBeenCalledTimes(1);
    const approveFd = bulkApproveMock.mock.calls[0][0] as FormData;
    expect(approveFd.get("runId")).toBe("r1");
    expect(approveFd.get("category")).toBe("merged");
    expect(approveFd.get("verb")).toBe("approved");

    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    const [, opts] = toastSuccessMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts).toBeDefined();
    const action = opts.action as { label: string; onClick: () => void };
    expect(action.label).toBe("Undo");

    action.onClick();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(revertMock).toHaveBeenCalledTimes(1);
    const revertFd = revertMock.mock.calls[0][0] as FormData;
    expect(revertFd.get("runId")).toBe("r1");
    expect(revertFd.get("category")).toBe("merged");
  });
});

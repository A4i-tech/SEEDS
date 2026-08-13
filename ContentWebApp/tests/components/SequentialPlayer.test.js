import { render, screen } from "@testing-library/react";
import { SequentialPlayer } from "../../src/components/ContentAggregatorDetails/SequentialPlayer";

jest.mock("../../src/components/ContentAggregatorDetails/UnitBlocks", () => ({
  UnitBlocks: () => null,
}));

describe("SequentialPlayer", () => {
  it("does not crash when the sequential has no verticals", () => {
    const sequential = { display_name: "Empty Section", verticals: [] };
    const chapter = { display_name: "Chapter", block_id: "chapter-1" };

    render(
      <SequentialPlayer
        chapter={chapter}
        sequential={sequential}
        seqIndex={0}
        seqCount={1}
        onNavigateSequential={() => {}}
        blockMap={{}}
        courseId="course-1"
        courseTitle="Demo Course"
        onBlockChange={() => {}}
        onBackToContent={() => {}}
        onBack={() => {}}
      />
    );

    expect(screen.getByText(/No content in this section/i)).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /Next →/i })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: /← Previous/i })) {
      expect(button).toBeDisabled();
    }
  });
});

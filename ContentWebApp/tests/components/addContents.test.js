import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AddContent from "../../src/components/AddContent";

jest.mock("../../src/components/AddQuiz", () => () => (
  <div data-testid="add-quiz">AddQuiz Component</div>
));
jest.mock("../../src/components/AddStory", () => ({ contentType }) => (
  <div data-testid="add-story">AddStory Component: {contentType}</div>
));

describe("AddContent", () => {
  it("renders the heading and default experience", () => {
    render(
      <MemoryRouter>
        <AddContent />
      </MemoryRouter>
    );
    expect(screen.getByText(/Add Content/i)).toBeInTheDocument();
    expect(screen.getByText(/Pick your experience/i)).toBeInTheDocument();
    expect(screen.getByTestId("add-story")).toHaveTextContent("Story");
  });

  it("shows AddQuiz when 'quiz' is selected", () => {
    render(
      <MemoryRouter>
        <AddContent />
      </MemoryRouter>
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "quiz" } });
    expect(screen.getByTestId("add-quiz")).toBeInTheDocument();
    expect(screen.queryByTestId("add-story")).not.toBeInTheDocument();
  });

  it("shows AddStory with correct contentType for other options", () => {
    render(
      <MemoryRouter>
        <AddContent />
      </MemoryRouter>
    );
    const select = screen.getByRole("combobox");
    ["Poem", "Song", "Snippet"].forEach((type) => {
      fireEvent.change(select, { target: { value: type } });
      expect(screen.getByTestId("add-story")).toHaveTextContent(type);
      expect(screen.queryByTestId("add-quiz")).not.toBeInTheDocument();
    });
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import AddQuiz from "../../src/components/AddQuiz";
import { MemoryRouter } from "react-router-dom";

describe("AddQuiz", () => {
  it("renders metadata fields and one question by default", () => {
    render(
      <MemoryRouter>
        <AddQuiz />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText(/Add Title/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Add Positive Marks/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Add Negative Marks/i)
    ).toBeInTheDocument();
    // There should be one question textbox (input[name=question])
    expect(
      screen
        .getAllByRole("textbox", { name: "" })
        .filter((input) => input.getAttribute("name") === "question").length
    ).toBe(1);
    expect(screen.getByPlaceholderText(/Add Option A/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Add Option B/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Add Option C/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Add Option D/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /\+ Question/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
  });

  it("adds a new question field when '+ Question' is clicked", () => {
    render(
      <MemoryRouter>
        <AddQuiz />
      </MemoryRouter>
    );
    const addButton = screen.getByRole("button", { name: /\+ Question/i });
    fireEvent.click(addButton);
    // There should be two question textboxes now
    expect(
      screen
        .getAllByRole("textbox", { name: "" })
        .filter((input) => input.getAttribute("name") === "question").length
    ).toBe(2);
  });

  it("removes a question field when 'Remove' is clicked", () => {
    render(
      <MemoryRouter>
        <AddQuiz />
      </MemoryRouter>
    );
    const addButton = screen.getByRole("button", { name: /\+ Question/i });
    fireEvent.click(addButton);
    let removeButtons = screen.getAllByRole("button", { name: /^Remove$/i });
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[1]);
    expect(
      screen
        .getAllByRole("textbox", { name: "" })
        .filter((input) => input.getAttribute("name") === "question").length
    ).toBe(1);
  });

  it("hydrates form fields from a quiz with the real nested questions shape", () => {
    const quiz = {
      id: "quiz1",
      title: { english: "Animals", local: "Animals" },
      theme: { english: "Nature", local: "Nature" },
      language: "en",
      positive_marks: 2,
      negative_marks: 1,
      questions: [
        {
          question: { id: "q1", text: "Which animal barks?" },
          options: [
            { id: "q1-opt1", text: "Cat" },
            { id: "q1-opt2", text: "Dog" },
            { id: "q1-opt3", text: "Cow" },
            { id: "q1-opt4", text: "Fish" },
          ],
          correct_option_id: "q1-opt2",
        },
      ],
    };

    render(
      <MemoryRouter>
        <AddQuiz quiz={quiz} />
      </MemoryRouter>
    );

    expect(screen.getByDisplayValue("Which animal barks?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cat")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cow")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fish")).toBeInTheDocument();

    const dogRadio = screen.getByRole("radio", { name: /Option B \(Correct Answer\)/i });
    expect(dogRadio.checked).toBe(true);
  });
});

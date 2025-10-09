import { render, screen, fireEvent } from "@testing-library/react";
import AddQuiz from "./AddQuiz";

describe("AddQuiz", () => {
    it("renders metadata fields and one question by default", () => {
        render(<AddQuiz />);
        expect(screen.getByPlaceholderText(/Add Title/i)).toBeInTheDocument();
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Add Positive Marks/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Add Negative Marks/i)).toBeInTheDocument();
        // There should be one question textbox (input[name=question])
        expect(screen.getAllByRole("textbox", { name: "" }).filter(input => input.getAttribute("name") === "question").length).toBe(1);
        expect(screen.getByPlaceholderText(/Add Option A/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Add Option B/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Add Option C/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Add Option D/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /\+ Question/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
    });

    it("adds a new question field when '+ Question' is clicked", () => {
        render(<AddQuiz />);
        const addButton = screen.getByRole("button", { name: /\+ Question/i });
        fireEvent.click(addButton);
        // There should be two question textboxes now
        expect(screen.getAllByRole("textbox", { name: "" }).filter(input => input.getAttribute("name") === "question").length).toBe(2);
    });

    it("removes a question field when 'Remove' is clicked", () => {
        render(<AddQuiz />);
        const addButton = screen.getByRole("button", { name: /\+ Question/i });
        fireEvent.click(addButton);
        let removeButtons = screen.getAllByRole("button", { name: /Remove/i });
        expect(removeButtons.length).toBe(2);
        fireEvent.click(removeButtons[1]);
        expect(screen.getAllByRole("textbox", { name: "" }).filter(input => input.getAttribute("name") === "question").length).toBe(1);
    });

    it("populates fields when quiz prop is provided", () => {
        const quiz = {
            title: "Sample Quiz",
            language: "english",
            positiveMark: 2,
            negativeMark: 1,
            questions: ["Q1?", "Q2?"],
            options: [
                ["A1", "B1", "C1", "D1"],
                ["A2", "B2", "C2", "D2"]
            ],
            id: "quiz-1"
        };
        render(<AddQuiz quiz={quiz} />);
        expect(screen.getByDisplayValue("Sample Quiz")).toBeInTheDocument();
        // Check that the correct language option is selected by checking the selected option's text
        const select = screen.getByRole("combobox");
        const selectedOption = select.options[select.selectedIndex];
        expect(selectedOption.value).toBe("english");
        expect(selectedOption.textContent.toLowerCase()).toBe("english");
        expect(screen.getByDisplayValue("2")).toBeInTheDocument();
        expect(screen.getByDisplayValue("1")).toBeInTheDocument();
        expect(screen.getAllByRole("textbox", { name: "" }).filter(input => input.getAttribute("name") === "question").length).toBe(2);
        expect(screen.getByDisplayValue("Q1?")).toBeInTheDocument();
        expect(screen.getByDisplayValue("A1")).toBeInTheDocument();
        expect(screen.getByDisplayValue("B1")).toBeInTheDocument();
        expect(screen.getByDisplayValue("C1")).toBeInTheDocument();
        expect(screen.getByDisplayValue("D1")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Q2?")).toBeInTheDocument();
        expect(screen.getByDisplayValue("A2")).toBeInTheDocument();
        expect(screen.getByDisplayValue("B2")).toBeInTheDocument();
        expect(screen.getByDisplayValue("C2")).toBeInTheDocument();
        expect(screen.getByDisplayValue("D2")).toBeInTheDocument();
    });
});

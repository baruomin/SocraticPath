export const scenarios = [
  {
    id: "makerspace-plans",
    sequence: 1,
    title: "Compare Makerspace Plans",
    difficulty: "Modeling",
    objective:
      "Translate two cost descriptions into linear expressions and interpret their break-even point.",
    concepts: ["linear models", "variables on both sides", "break-even reasoning"],
    prompt:
      "A makerspace offers Plan A for $18 per month plus $7 per workshop. Plan B costs $42 per month plus $3 per workshop. After how many workshops in one month do the plans cost the same? Define your variable and explain what your result means.",
    answerLabel: "w = 6 workshops",
    answerPatterns: [
      "\\b(?:w|workshops?)\\s*=\\s*6(?:\\.0+)?\\b",
      "\\b6(?:\\.0+)?\\s+workshops?\\b",
      "^6(?:\\.0+)?$"
    ],
    forbiddenAnswerPatterns: [
      "\\b(?:w|workshops?)\\s*=\\s*6(?:\\.0+)?\\b",
      "\\b6(?:\\.0+)?\\s+workshops?\\b",
      "(?:answer|break-even|same cost)[^.!?]{0,24}\\b6\\b"
    ],
    openingQuestion:
      "What should your variable represent, and what expression gives the total monthly cost of each plan?",
    selfExplanationPrompt:
      "Why does setting the two cost expressions equal locate the break-even point, and how can you verify the result in both plans?",
    explanationKeywords: ["equal", "both plans", "cost", "substitute", "same", "workshop"],
    engagementPrompts: [
      "Write one cost expression and explain what each term represents.",
      "Write both total-cost expressions and explain why they should be equal.",
      "Try collecting the workshop terms on one side and the fixed fees on the other.",
      "Use the partial equation shown in the hint, then attach units to your result.",
      "Check the worked explanation by evaluating both plans at the same number of workshops."
    ],
    evidencePatterns: [
      [],
      [
        "18\\s*\\+\\s*7\\s*[a-z]",
        "42\\s*\\+\\s*3\\s*[a-z]",
        "(?:same|equal|break.?even).{0,30}(?:cost|plan)",
        "(?:fixed|monthly).{0,20}(?:fee|cost).{0,30}(?:workshop|variable)"
      ],
      [
        "18\\s*\\+\\s*7\\s*w\\s*=\\s*42\\s*\\+\\s*3\\s*w",
        "4\\s*w\\s*=\\s*24",
        "subtract.{0,20}(?:3\\s*w|18)",
        "collect.{0,24}(?:terms|constants|fees)"
      ],
      [
        "4\\s*w\\s*=\\s*24",
        "24\\s*[/÷]\\s*4",
        "divid(?:e|ing).{0,24}(?:by\\s*)?4",
        "(?:workshop|unit)"
      ]
    ],
    hints: [
      {
        label: "Diagnostic question",
        prompt:
          "What quantity changes from month to month, and how would that quantity appear in each plan's total-cost expression?"
      },
      {
        label: "Concept connection",
        prompt:
          "At the break-even point, the two total costs are equal. Each total combines a fixed monthly fee with a per-workshop charge."
      },
      {
        label: "Strategy cue",
        prompt:
          "Let w represent workshops and set 18 + 7w = 42 + 3w. Collect the w-terms on one side and the fixed fees on the other."
      },
      {
        label: "Worked next step",
        prompt:
          "Subtracting 3w and then 18 from both sides gives 4w = 24. Divide to find w, then state what the number means in context."
      },
      {
        label: "Worked explanation",
        prompt:
          "Model the plans as A = 18 + 7w and B = 42 + 3w. Set them equal: 18 + 7w = 42 + 3w. Subtract 3w and 18 to get 4w = 24, so w = 6 workshops. Both plans then cost $60, confirming the break-even point."
      }
    ],
    misconceptions: [
      {
        id: "compared-rates-only",
        label: "Compared variable rates but ignored fixed fees",
        patterns: ["7\\s*=\\s*3", "(?:only|just).{0,18}(?:7|3).{0,12}(?:rate|workshop)"],
        feedback:
          "Comparing only the per-workshop charges leaves out the different monthly fees, which also affect total cost."
      },
      {
        id: "added-plan-costs",
        label: "Added the two plans instead of comparing them",
        patterns: ["18\\s*\\+\\s*7\\s*\\+\\s*42\\s*\\+\\s*3", "^(?:w\\s*=\\s*)?70$"],
        feedback:
          "Adding both plans combines two alternatives; break-even requires comparing their separate totals by setting them equal."
      },
      {
        id: "reported-cost-not-input",
        label: "Reported the common cost instead of the number of workshops",
        patterns: ["^(?:w\\s*=\\s*)?60(?:\\.0+)?$", "(?:workshops?|w)\\s*=\\s*60"],
        feedback:
          "That value is related to the common monthly cost, but the question asks for the number of workshops."
      }
    ],
    workedSolution: [
      "Let w be the number of workshops.",
      "Set total costs equal: 18 + 7w = 42 + 3w.",
      "Collect terms: 4w = 24, so w = 6 workshops.",
      "Check: both plans cost $60 when w = 6."
    ]
  },
  {
    id: "garden-design",
    sequence: 2,
    title: "Design a Community Garden",
    difficulty: "Multi-step",
    objective:
      "Build and solve a perimeter equation from a geometric relationship, then interpret both dimensions.",
    concepts: ["algebraic modeling", "distribution", "perimeter constraints"],
    prompt:
      "A rectangular community garden has a perimeter of 54 meters. Its length is 3 meters more than twice its width. Find both dimensions, and show how your equation accounts for all four sides.",
    answerLabel: "width = 8 m and length = 19 m",
    answerPatterns: [
      "(?:width|w)\\s*(?:=|is)?\\s*8(?:\\.0+)?\\s*(?:m|meters?)?.{0,45}(?:length|l)\\s*(?:=|is)?\\s*19(?:\\.0+)?",
      "(?:length|l)\\s*(?:=|is)?\\s*19(?:\\.0+)?\\s*(?:m|meters?)?.{0,45}(?:width|w)\\s*(?:=|is)?\\s*8(?:\\.0+)?"
    ],
    forbiddenAnswerPatterns: [
      "(?:width|w)\\s*(?:=|is)?\\s*8(?:\\.0+)?\\s*(?:m|meters?)?",
      "(?:length|l)\\s*(?:=|is)?\\s*19(?:\\.0+)?\\s*(?:m|meters?)?",
      "\\b8\\s*(?:m|meters?)\\s+(?:wide|width)"
    ],
    openingQuestion:
      "If w is the width, how would you express the length, and which perimeter formula uses both pairs of equal sides?",
    selfExplanationPrompt:
      "Explain why the equation counts every side, how distribution affects the length term, and how the dimensions verify the perimeter.",
    explanationKeywords: ["perimeter", "twice", "both", "distribute", "substitute", "four sides"],
    engagementPrompts: [
      "Define the width and write the length in terms of it.",
      "Use P = 2w + 2l and substitute the expression for length.",
      "Distribute and combine like terms in the perimeter equation.",
      "Use the simplified equation, then substitute the width back to find the length.",
      "Verify that two widths plus two lengths total 54 meters."
    ],
    evidencePatterns: [
      [],
      [
        "(?:l|length)\\s*=\\s*2\\s*w\\s*\\+\\s*3",
        "2\\s*w\\s*\\+\\s*2\\s*l",
        "(?:four|all).{0,18}sides",
        "perimeter.{0,24}(?:twice|2)"
      ],
      [
        "2\\s*w\\s*\\+\\s*2\\s*\\(\\s*2\\s*w\\s*\\+\\s*3\\s*\\)\\s*=\\s*54",
        "6\\s*w\\s*\\+\\s*6\\s*=\\s*54",
        "distribut.{0,25}(?:2|parenth)",
        "combine.{0,20}(?:like|terms)"
      ],
      [
        "6\\s*w\\s*=\\s*48",
        "48\\s*[/÷]\\s*6",
        "2\\s*\\(?\\s*8\\s*\\)?\\s*\\+\\s*3",
        "substitut.{0,24}(?:width|w|length)"
      ]
    ],
    hints: [
      {
        label: "Diagnostic question",
        prompt:
          "If w represents width, what expression represents a length that is 3 more than twice w? How does perimeter count repeated sides?"
      },
      {
        label: "Concept connection",
        prompt:
          "A rectangle's perimeter is 2w + 2l. Substitute l = 2w + 3 so the single equation represents both the dimension relationship and all four sides."
      },
      {
        label: "Strategy cue",
        prompt:
          "Use 2w + 2(2w + 3) = 54. Distribute the outside 2, combine like terms, and then isolate w."
      },
      {
        label: "Worked next step",
        prompt:
          "Distribution gives 2w + 4w + 6 = 54, so 6w = 48. Find w, then substitute it into l = 2w + 3."
      },
      {
        label: "Worked explanation",
        prompt:
          "Let width be w and length be 2w + 3. The perimeter equation is 2w + 2(2w + 3) = 54. Simplifying gives 6w + 6 = 54, then 6w = 48, so the width is 8 m and the length is 19 m. The check 2(8) + 2(19) = 54 confirms both dimensions."
      }
    ],
    misconceptions: [
      {
        id: "used-area-formula",
        label: "Used area instead of perimeter",
        patterns: ["w\\s*\\(\\s*2\\s*w\\s*\\+\\s*3\\s*\\)\\s*=\\s*54", "area.{0,24}54"],
        feedback:
          "Multiplying width by length models area, while the given 54 meters is a perimeter that adds four side lengths."
      },
      {
        id: "counted-two-sides",
        label: "Counted only one width and one length",
        patterns: ["w\\s*\\+\\s*\\(?\\s*2\\s*w\\s*\\+\\s*3\\s*\\)?\\s*=\\s*54", "(?:w|width)\\s*=\\s*17"],
        feedback:
          "One width plus one length counts only half of the rectangle's boundary; each dimension appears twice."
      },
      {
        id: "partial-distribution",
        label: "Distributed to only one term",
        patterns: ["2\\s*w\\s*\\+\\s*4\\s*w\\s*\\+\\s*3\\s*=\\s*54", "(?:w|width)\\s*=\\s*8\\.5"],
        feedback:
          "The outside 2 multiplies both terms inside the parentheses, including the constant 3."
      }
    ],
    workedSolution: [
      "Let w be width and 2w + 3 be length.",
      "Model perimeter: 2w + 2(2w + 3) = 54.",
      "Simplify: 6w + 6 = 54, so w = 8.",
      "Then length = 2(8) + 3 = 19; check 2(8) + 2(19) = 54."
    ]
  },
  {
    id: "ticket-mix",
    sequence: 3,
    title: "Reconstruct Ticket Sales",
    difficulty: "Challenge",
    objective:
      "Use a system of constraints to recover two unknown quantities and verify them against both totals.",
    concepts: ["systems of equations", "substitution", "constraint checking"],
    prompt:
      "A school concert sold 40 tickets. Adult tickets cost $12 and student tickets cost $7. Total revenue was $365. How many adult tickets and student tickets were sold? Show how your answer satisfies both the ticket-count and revenue constraints.",
    answerLabel: "17 adult tickets and 23 student tickets",
    answerPatterns: [
      "(?:adult|a)\\s*(?:=|is)?\\s*17(?:\\.0+)?.{0,50}(?:student|s)\\s*(?:=|is)?\\s*23(?:\\.0+)?",
      "(?:student|s)\\s*(?:=|is)?\\s*23(?:\\.0+)?.{0,50}(?:adult|a)\\s*(?:=|is)?\\s*17(?:\\.0+)?",
      "17\\s+adult.{0,35}23\\s+student",
      "23\\s+student.{0,35}17\\s+adult"
    ],
    forbiddenAnswerPatterns: [
      "(?:adult|a)\\s*(?:=|is)?\\s*17(?:\\.0+)?",
      "(?:student|s)\\s*(?:=|is)?\\s*23(?:\\.0+)?",
      "17\\s+adult",
      "23\\s+student"
    ],
    openingQuestion:
      "What two unknowns could you define, and what separate equation represents the number of tickets versus the revenue?",
    selfExplanationPrompt:
      "Explain how the two equations represent different constraints, why substitution preserves both, and how you checked each total.",
    explanationKeywords: ["40", "365", "substitute", "revenue", "tickets", "both equations"],
    engagementPrompts: [
      "Define variables for the two ticket types and write one constraint.",
      "Write both the ticket-count and revenue equations.",
      "Solve one count equation for a variable and substitute it into the revenue equation.",
      "Finish the simplified one-variable equation, then use the count total to recover the other quantity.",
      "Check that the two ticket counts total 40 and their revenue totals $365."
    ],
    evidencePatterns: [
      [],
      [
        "a\\s*\\+\\s*s\\s*=\\s*40",
        "12\\s*a\\s*\\+\\s*7\\s*s\\s*=\\s*365",
        "(?:count|tickets?).{0,24}40",
        "revenue.{0,24}365"
      ],
      [
        "s\\s*=\\s*40\\s*-\\s*a",
        "a\\s*=\\s*40\\s*-\\s*s",
        "12\\s*a\\s*\\+\\s*7\\s*\\(\\s*40\\s*-\\s*a\\s*\\)",
        "substitut.{0,30}(?:40|revenue|equation)"
      ],
      [
        "5\\s*a\\s*=\\s*85",
        "5\\s*a\\s*\\+\\s*280\\s*=\\s*365",
        "85\\s*[/÷]\\s*5",
        "40\\s*-.{0,12}(?:adult|a)"
      ]
    ],
    hints: [
      {
        label: "Diagnostic question",
        prompt:
          "If a and s are the two ticket counts, which equation records 40 total tickets, and which equation records $365 in revenue?"
      },
      {
        label: "Concept connection",
        prompt:
          "The count constraint is a + s = 40. The revenue constraint multiplies each count by its price: 12a + 7s = 365. A valid answer must satisfy both."
      },
      {
        label: "Strategy cue",
        prompt:
          "Solve the count equation as s = 40 - a, then substitute that expression for s in 12a + 7s = 365."
      },
      {
        label: "Worked next step",
        prompt:
          "Substitution gives 12a + 7(40 - a) = 365, which simplifies to 5a + 280 = 365 and then 5a = 85. Finish a, then use s = 40 - a."
      },
      {
        label: "Worked explanation",
        prompt:
          "Let a and s be adult and student ticket counts. Use a + s = 40 and 12a + 7s = 365. Substitute s = 40 - a: 12a + 7(40 - a) = 365, so 5a = 85 and a = 17. Then s = 23. The checks 17 + 23 = 40 and 12(17) + 7(23) = 365 satisfy both constraints."
      }
    ],
    misconceptions: [
      {
        id: "used-average-as-count",
        label: "Treated average ticket price as a ticket count",
        patterns: ["365\\s*[/÷]\\s*40", "(?:adult|student|tickets?)\\s*=\\s*9\\.125"],
        feedback:
          "Dividing total revenue by total tickets gives an average price, not the number of either ticket type."
      },
      {
        id: "reversed-ticket-counts",
        label: "Reversed the two ticket counts",
        patterns: [
          "(?:adult|a)\\s*(?:=|is)?\\s*23.{0,50}(?:student|s)\\s*(?:=|is)?\\s*17",
          "23\\s+adult.{0,35}17\\s+student"
        ],
        feedback:
          "Those counts add to 40, but assigning the larger count to adult tickets does not reproduce the stated revenue."
      },
      {
        id: "ignored-count-constraint",
        label: "Used revenue without the total-ticket constraint",
        patterns: ["12\\s*a\\s*\\+\\s*7\\s*s\\s*=\\s*365.{0,40}(?:only|enough|solve)"],
        feedback:
          "The revenue equation alone contains two unknowns; the 40-ticket total provides the second independent constraint."
      }
    ],
    workedSolution: [
      "Let a be adult tickets and s be student tickets.",
      "Use a + s = 40 and 12a + 7s = 365.",
      "Substitute s = 40 - a to obtain 5a = 85, so a = 17.",
      "Then s = 23; both the count and revenue checks hold."
    ]
  }
];

export function getScenario(id) {
  return scenarios.find((scenario) => scenario.id === id);
}

export function toPublicScenario(scenario) {
  return {
    id: scenario.id,
    sequence: scenario.sequence,
    title: scenario.title,
    difficulty: scenario.difficulty,
    objective: scenario.objective,
    concepts: scenario.concepts,
    prompt: scenario.prompt,
    openingQuestion: scenario.openingQuestion
  };
}

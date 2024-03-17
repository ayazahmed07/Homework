import inquirer from "inquirer";
const answer = await inquirer.prompt([{ message: "Enter first number", type: "number", name: "firstnumber" },
    { message: "Enter second numsber", type: "number", name: "secondnumber" },
    { message: "Select one of the operators to perform operation",
        type: "list",
        name: "operator",
        choices: ["Addition", "Substraction", "Multiply", "Divide"]
    },
]);
// conditional statement
if (answer.operator === "Addition") {
    console.log(answer.firstnumber + answer.secondnumber);
}
else if (answer.operator === "Substraction") {
    console.log(answer.firstnumber - answer.secondnumber);
}
else if (answer.operator === "Multiply") {
    console.log(answer.firstnumber * answer.secondnumber);
}
else if (answer.operator === "Divide") {
    console.log(answer.firstnumber / answer.secondnumber);
}
else {
    console.log("Please select valid operator");
}

let guess = Math.floor(Math.random() * 10 + 1);
let target = Math.floor(Math.random() * 10 + 1);
if (guess == target){console.log("Congratulations! You guessed the exact number");}
else if (guess > target){console.log("You guess a high number");}
else if (guess < target){console.log("You guess a low number");}

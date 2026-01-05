function displayValue() {
    // 1. Get the value from the input field
    const inputField = document.getElementById("userInput");
    const value = inputField.value;

    // 2. Target the display area
    const displayArea = document.getElementById("displayArea");

    // 3. Print the value back to the page
    displayArea.innerText = "You entered: " + value;
}

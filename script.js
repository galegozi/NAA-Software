function computeDecayConstant(halfLife) {
    //argument half life: the half life in seconds.
    return Math.log(2) / halfLife
}

function submitButtonPress() {
    const elemName = document.getElementById("elementName").value;
    const isotope = document.getElementById("isotope").value;
    const energy = document.getElementById("energy").value;

    alert("Using energy for decay constant. Please fix this & remove this message.");

    const decayConstant = computeDecayConstant(energy);

    // 2. Target the display area
    const displayArea = document.getElementById("displayArea");

    // 3. Print the value back to the page
    // displayArea.innerText = "You entered: " + value;

    //decay constant = ln2/half time

    displayArea.innerText = `The decay constant for element ${elemName} with isotope ${isotope} and an energy of ${energy} is: ${decayConstant}`;
}

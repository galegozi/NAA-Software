function computeDecayConstant() {
    const elemName = document.getElementById("elementName").value;
    const isotope = document.getElementById("isotope").value;
    const energy = document.getElementById("energy").value;

    // 2. Target the display area
    const displayArea = document.getElementById("displayArea");

    // 3. Print the value back to the page
    // displayArea.innerText = "You entered: " + value;

    displayArea.innerText = `The decay constant for element ${elemName} with isotope ${isotope} and an energy of ${energy} is: 999.999`
}

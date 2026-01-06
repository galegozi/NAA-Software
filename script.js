function computeDecayConstant(halfLife) {
    //argument half life: the half life in seconds.
    return Math.log(2) / halfLife
}

function submitButtonPress() {
    const elemName = document.getElementById("elementName").value;
    const isotope = document.getElementById("isotope").value;
    const energy = document.getElementById("energy").value;
    const halfLife = document.getElementById("halfLife").value;

    const decayConstant = computeDecayConstant(halfLife);

    const displayArea = document.getElementById("displayArea");

    lines = [
        "Input Information:\n",
        `Element: ${elemName}`,
        `Isotope: ${isotope}`,
        `Energy: ${energy}`,
        `Half Life: ${halfLife}\n`,
        `Using ln(2)/halfLife, the decay constant is: ${decayConstant}`
    ];
    displayArea.innerText = lines.join("\n");
}

const Discord = require("discord.js");
const client = new Discord.Client();
const brain = require("brain.js");
const fs = require('file-system');

const config = {
    binaryThresh: 0.5,
    hiddenLayers: [3], // array of ints for the sizes of the hidden layers in the network
    activation: 'sigmoid', // supported activation types: ['sigmoid', 'relu', 'leaky-relu', 'tanh'],
    leakyReluAlpha: 0.01 // supported for activation type 'leaky-relu'
};

const net = new brain.recurrent.LSTM();
net.fromJSON(JSON.parse(fs.readFileSync("network.json", "utf8")))
console.log("Loaded from JSON");

setInterval(() => {
    fs.writeFile("network.json", JSON.stringify(net.toJSON()));
    console.log("Saved!");
}, 1000 * 60 * 10) // Save every 10 minutes


/* Simple emitter, works just like Discord.js och Socket.io */
class Emitter {
    constructor() {
        this.content = new Array();
    }
    on(callsign, content) {
        this.content[callsign] = content;
    }
    emit(callsign, content) {
        this.content[callsign](content);
    }
}

// Set new commands with commands.on(COMMAND_NAME, DiscordMessage => { CODE_HERE })
const commands = new Emitter();

commands.on("talk", message => {
    // Talk with user.
    var run_data = message.content.substr(message.content.indexOf(" ")).trim();
    var response = net.run(run_data);
    console.log("Response: ", response);
    message.reply(response);
})

commands.on("train", message => {
    var text = message.content;
    var err = null;
    if (text.length > 300) err = "This data is too long to train on, please keep it under 300 characters total.";
    if (text.indexOf(":") === -1) err = "This data is not formated correctly, please see !help";

    var train_input = text.substr("!train ".length);
    train_input = train_input.substr(0, train_input.indexOf(":"));
    var train_output = text.substr(text.indexOf(":") + 1);

    train_input = train_input.trim();
    train_output = train_output.trim();

    if (train_input.length < 1) err = "Input data is too short.";
    if (train_output.leakyReluAlpha < 1) err = "Train output is too short.";

    if (err !== null) {
        message.reply(err);
        return;
    }

    console.log("Training data: ", {
        train_input,
        train_output
    });
    net.train([{
        input: train_input,
        output: train_output
    }], {
        iterations: 1000
    });
    console.log("Trained!");
});

commands.on("save", message => {
    fs.writeFileSync("network.json", JSON.stringify(net.toJSON()));
    console.log("Saved net!");
    message.reply("Saved net!")
})

commands.on("help", message => {
    message.channel.send({
        embed: {
            color: 9999999,
            author: {
                name: client.user.username,
                icon_url: client.user.avatarURL
            },
            description: "Hello! I'm a bot based on Machine Learning. You can teach me how to act! [Check out my code on Github](https://github.com/Yogsther/livfor.it-bot)",
            fields: [{
                    name: "To talk with me:",
                    value: "Just @ me with your message, Ex. ```@" + client.user.tag + " Hello!``` or you can chat with me in private (you can also teach me in private...)"
                },
                {
                    name: "To teach me:",
                    value: "Use **!train** to train me. First write the input, then the desired output after a semicolon - like this: ```!train Hello! : Hi!```"
                },
                {
                    name: "NOTE:",
                    value: "It takes me a short while to comprehend things when I'm taught, so I might disappear some times."
                }
            ],
            timestamp: new Date(),
            footer: {
                icon_url: client.user.avatarURL,
                text: "© Livfor.it Bot"
            }
        }
    });
})


client.on("ready", () => {
    console.log(client.user.tag + " is ready to roll!");
    client.user.setActivity("Machine Learning Bot | !help")
})

client.on("message", message => {
    if (message.author.tag == client.user.tag) return;
    /* message.channel.send(message.content); */
    if (message.content.split(" ")[0].substr(0, 1) == "!") { // Message starts with "!", i.e a command.
        try {
            commands.emit(message.content.split(" ")[0].substr(1), message); // Run command, with the message
        } catch (e) {
            console.log("Not a command or failed.", e)
        }
    } else if (message.isMemberMentioned(client.user) || message.channel.type == "dm") {
        // Bot is mentioned, talk with the user.
        commands.emit("talk", message);
    }

})

client.login(fs.readFileSync("token", "utf8")); // Login using token file, listed in the gitignore.
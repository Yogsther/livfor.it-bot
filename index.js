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

class Message{
    constructor(message){
        this.date = Date.now();
        this.content = message.content;
        this.channel = message.channel.name;
    }
}

var messages = [];
var conversation_timeout = 1000 * 60; // One minute is the timeout for a conversation.


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
    test(callsign){
        if(this.content[callsign] !== undefined) return true;
            return false;
    }
}

// Set new commands with commands.on(COMMAND_NAME, DiscordMessage => { CODE_HERE })
const commands = new Emitter();

commands.on("talk", message => {
    // Talk with user.
    var run_data = message.content.trim();
    if(message.content[0] == "!" || message.isMemberMentioned(client.user)){
        run_data = message.content.substr(message.content.indexOf(" ")+1).trim();
    }
    
    var response = net.run(run_data);
    console.log("Talk | Input: '" + run_data + "' Response: '" + response + "'");
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
    if (train_output.length < 1) err = "Train output is too short.";

    if (err !== null) {
        message.reply(err);
        return;
    }
    
    console.log("Training data: ", {
        train_input,
        train_output
    });

    train(train_input, train_output);
});

function train(input, output){

    input = input.trim();
    output = output.trim();

    if (input.length < 1 || output.length < 1) return;
    if(input.length > 300 || output.length > 300) return;

    net.train([{
        input: input,
        output: output
    }], {
        iterations: 1000
    });

    fs.writeFile("network.json", JSON.stringify(net.toJSON()));
    console.log("Done training, and saved.");
}

commands.on("save", message => {
    fs.writeFileSync("network.json", JSON.stringify(net.toJSON()));
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
            description: "Hello! I'm a bot based on Machine Learning. You can teach me how to act! I listen to conversations in this channel and learn... [Check out my code on Github](https://github.com/Yogsther/livfor.it-bot)",
            fields: [{
                    name: "To talk with me:",
                    value: "Just @ me with your message or use !talk, Ex. ```@" + client.user.tag + " Hello!``` or you can chat with me in private (you can also teach me in private...)"
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

client.on("message", message => {
    if (message.author.tag == client.user.tag) return;
    
    /* message.channel.send(message.content); */
    if (message.content.split(" ")[0].substr(0, 1) == "!") { // Message starts with "!", i.e a command.
        try {
            var command = message.content.split(" ")[0].substr(1);
            if(commands.test(command)){ // Test that the command exists.
                commands.emit(command, message); // Run command, with the message.
            }
        } catch (e) {
            console.log("Not a command or failed.", e)
        }
    } else if (message.isMemberMentioned(client.user) || message.channel.type == "dm") {
        // Bot is mentioned or is in DM, talk with the user.
        try{
            commands.emit("talk", message);            
        } catch(e){ console.log(e) }
    } else {
        // If it was not directed tworards the bot
        // See what the reponse from the bot would be to that message, if it's of certain length - send it.
        var response = net.run(message.content);
        if(response.length > 10) message.reply(response);

        // Passive learning
        loop_messages(new Message(message));
    }
})

function loop_messages(new_message){
    var now = Date.now();
    for(i = messages.length-1; i >= 0; i--){ // Backwards loop to get the freshest messages first!
        message = messages[i];
        if(message.date < now - conversation_timeout){
            messages.splice(i, 1); // Remove old messages, (older than conversation_timout)
        } else {
            if(message.channel == new_message.channel){
                // Same channel
                try{
                    console.log("Passive learning | Input: '" + message.content + "' output: '" + new_message.content + "'");
                    train(message.content, new_message.content); // Train the net on this answer.
                } catch(e){console.log(e)}
                break;
            }
        }
    }
    messages.push(new_message); // Push the new message
}

client.on("ready", () => {
    console.log(client.user.tag + " is ready to roll!");
    client.user.setActivity("Machine Learning Bot | !help")
})

client.login(fs.readFileSync("token", "utf8")); // Login using token file, listed in the gitignore.
//imports
require("dotenv").config({ path: __dirname + '/../.env' })
var path = require('path');
const express = require("express")
const cors = require("cors")
const morgan = require("morgan")
//const mongoose = require("mongoose");
var bodyParser = require('body-parser');

const { Client, Intents } = require('discord.js');

const discordjsClient = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_WEBHOOKS ] });

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

var currentUser =  "";
var clients = [];

// setup an express app
const app = express()
/*
// database setings
mongoose.connect(process.env.DB_HOST, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

var db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error"));
db.once("open", function (callback) {
    console.log("Connection succeeded");
})*/

var http = require('http').Server(app)
var io = require('socket.io')(http,{
    cors: {
      origin: "http://localhost:1234",
      methods: ["GET", "POST"],
      credentials: true
    },
    allowEIO3: true
});

io.on('connection', (socket) => {

    currentUser = socket.id;

    console.log( "Ip address: "+ socket.handshake.address );

    let foundClient = clients.find((client) => client.socketId && client.socketId ===  socket.id  )
    if (!foundClient){
        clients.push( { userId: "", socketId: socket.id , accessToken: "",  channel: "" } );
    }    
    console.log('A User is connected..');
   
    socket.on('send-chat-message', async (content) => {
        
        let foundClientSendMessage = clients.find((client) => client.socketId && client.socketId ===  socket.id  )

        if(discordjsClient.isReady()){
            const channel = discordjsClient.channels.cache.get(foundClientSendMessage.channel);
            try {
                const webhooks = await channel.fetchWebhooks();
                const webhook = webhooks.first();

                await webhook.send({
                    content: content.message,
                    username: foundClientSendMessage.userId
                });
            } catch (error) {
                console.error('Error trying to send a message: ', error);
            }
        }

    });

    socket.on('update-chat-message', () => {} );

    socket.on('delete-chat-message', () => {} );

    socket.on('subscribe', async (payload) => {
        console.log('subscribed to channel:' + payload.channel );
        socket.join(payload.channel);
        
        let foundClient = clients.find((client) => client.socketId && client.socketId === socket.id  )
        if (!foundClient){
            clients.push( { userId: payload.userId, socketId: socket.id , accessToken: "", channel: payload.channel } );
        }
        else{
            foundClient['channel'] = payload.channel;
            foundClient['userId'] = payload.userId;
        }

        if(discordjsClient.isReady()){
            const channel = discordjsClient.channels.cache.get(payload.channel);
            if (channel){
            
                let foundClientAgain = clients.find((client) => client.socketId && client.socketId === socket.id  );
                if (foundClientAgain.webhook === undefined || foundClientAgain.webhook === "" ){
                        //Create a new Webhook
                        channel.createWebhook(payload.userId, {
                            avatar: 'https://i.imgur.com/AfFp7pu.png',
                        })
                        .then(webhook => { 
                            console.log(`Created webhook ${webhook}`);                            
                            foundClientAgain['webhook'] = webhook.id;
                        })
                        .catch(console.error);
                }               

                //Grab all the messages in that Channel
                let messages = await channel.messages.fetch();
               // console.log("Messages from webhook: " + JSON.stringify(messages))
                let MessageObject = messages.map(function(message) {
    
                        let role = message.author.bot ? "bot" : message.author.system ? "sysadmin" : message.webhookId ? "guest": "member";
                        let Author = { 
                            name: message.author.username, 
                            avatar: message.author.avatar,
                            type:  role,
                            id: message.author.id,
                            color: String(message.author.accent_color),
                            roles: [{ name: role, color: String(message.author.accent_color) , position: "nil" }] 
                        };
                    
                        let Reaction;
                        if (message.reactions && message.reactions.length > 0){
                            Reaction = message.reactions.map((rx) => {        
                                return { name: rx.emoji.name, id: rx.emoji.id, count: rx.count }
                            })  
                        }
                    
                        let Attachment;
                        if (message.attachments && message.attachments.length > 0){
                            Attachment = {
                                url: message.attachments[0].url,
                                height: message.attachments[0].height,
                                width: message.attachments[0].width
                            };
                        }     
                    
                        let mention_members ;
                        if (message.mentions && message.mentions.users.length > 0){       
                            mention_members = message.mentions.users.map((user) => {
                            let role_mention = user.bot ? "bot" : user.system ? "sysadmin" : message.webhookId ? "guest": "member";
                            return {
                                name: user.username,
                                id: user.id,
                                roles: [{name: role_mention, color: user.accent_color , position: "nil"}],
                                avatar: user.avatar 
                            }
                            });
                        }
                    
                        let mention_roles ;
                        if ( message.mentions && message.mentions.roles.length > 0){       
                            mention_roles = message.mentions.roles.map((role) => {        
                                return { name: role.name , color: role.color , id: role.id }
                            });
                        }
                    
                        return { 
                            id: message.id,
                            author: Author,
                            timestamp: message.createdTimestamp,
                            content: message.content,
                            embeds: null,
                            editedAt: new Date( message.editedTimestamp ),
                            type: message.type === 19 ? "REPLY" : message.type === 7 ? "GUILD_MEMBER_JOIN" : "DEFAULT",
                            reactions: Reaction,
                            attachment: Attachment,
                            mentions: {
                                members: mention_members,
                                roles: mention_roles,
                                everyone: message.mentions.everyone
                            }
                        }
              });

              let action2 = {
                type: 'message',
                payload: { message: MessageObject, channel: channel.name } //pls deconstruct this object later
              };

              socket.emit('update', action2 );

            }
        }      

    });

});

app.use(morgan("dev"))
//app.use('/static',express.static("asset") )
app.use(bodyParser.json({limit: '30mb'}));
app.use(bodyParser.urlencoded({limit: '30mb', extended: true}));

app.use(cors());

app.options('*', cors())


// Getting our Root URL
app.get(`/`,function (req, res) { 
  //  return res.render(__dirname+"/views/index.html");
    return res.sendFile(path.join(__dirname+'/../views/index.html'));
});



//&scope=identify%20messages.read%20webhook.incoming&response_type=code&redirect_uri=${redirect}
app.get(`/user/authorize`, function (req, res) {
    return res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=536871968&scope=bot%20applications.commands`);
});

discordjsClient.on('ready', () => {
	console.log('discordjsClient Ready!');
});

discordjsClient.on('messageCreate', async (msg) => {
  //  console.log("My messages: "+ msg)
    for (let client of clients){
        if ( msg.channelId === client.channel ) {

            const channel = discordjsClient.channels.cache.get(msg.channelId);
            if (channel){            

                //Grab all the messages in that Channel
                let messages = await channel.messages.fetch();
                //console.log("Messages from webhook: " + JSON.stringify(messages))
                let MessageObject = messages.map(function(message) {
    
                    let role = message.author.bot ? "bot" : message.author.system ? "sysadmin" : message.webhookId ? "guest": "member";
                    let Author = { 
                        name: message.author.username, 
                        avatar: message.author.avatar,
                        type:  role,
                        id: message.author.id,
                        color: String(message.author.accent_color),
                        roles: [{ name: role, color: String(message.author.accent_color) , position: "nil" }] 
                    };
                
                    let Reaction;
                    if (message.reactions && message.reactions.length > 0){
                        Reaction = message.reactions.map((rx) => {        
                            return { name: rx.emoji.name, id: rx.emoji.id, count: rx.count }
                        })  
                    }
                
                    let Attachment;
                    if (message.attachments && message.attachments.length > 0){
                        Attachment = {
                            url: message.attachments[0].url,
                            height: message.attachments[0].height,
                            width: message.attachments[0].width
                        };
                    }     
                
                    let mention_members ;
                    if (message.mentions && message.mentions.users.length > 0){       
                        mention_members = message.mentions.users.map((user) => {
                        let role_mention = user.bot ? "bot" : user.system ? "sysadmin" : message.webhookId ? "guest": "member";
                        return {
                            name: user.username,
                            id: user.id,
                            roles: [{name: role_mention, color: user.accent_color , position: "nil"}],
                            avatar: user.avatar 
                        }
                        });
                    }
                
                    let mention_roles ;
                    if ( message.mentions && message.mentions.roles.length > 0){       
                        mention_roles = message.mentions.roles.map((role) => {        
                            return { name: role.name , color: role.color , id: role.id }
                        });
                    }
                
                    return { 
                        id: message.id,
                        author: Author,
                        timestamp: message.createdTimestamp,
                        content: message.content,
                        embeds: null,
                        editedAt: new Date( message.editedTimestamp ),
                        type: message.type === 19 ? "REPLY" : message.type === 7 ? "GUILD_MEMBER_JOIN" : "DEFAULT",
                        reactions: Reaction,
                        attachment: Attachment,
                        mentions: {
                            members: mention_members,
                            roles: mention_roles,
                            everyone: message.mentions.everyone
                        }
                    }
                });

              let action2 = {
                type: 'message',
                payload:  { message: MessageObject, channel: channel.name } //pls deconstruct this object later
              };
         
              io.in(client.channel).emit('update', action2 );

            }

        }
    }
   
});
 
discordjsClient.login(process.env.DISCORD_TOKEN);

http.listen(process.env.PORT || 3035, () => console.log(`Listening on ${ process.env.PORT }`))

module.exports = app;



console.log("Mitsuba WebSocket Server\n**************************");

//SETTINGS
var port = 9003;

var index = process.argv.indexOf("-p");
if(index != -1)
	port = parseInt( process.argv[ index + 1 ] );

//CREATE GAME *********************
var Mitsuba = require("./mitsuba.js");

//LAUNCH SERVER ***********************
var http = require('http');
var url = require('url');

//HTTP REQUESTS
var server = http.createServer( function(request, response) {

	response.setHeader('Access-Control-Allow-Origin', '*');
	response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	console.log("REQUEST: " + request.url );

	var url_info = url.parse( request.url, true ); //all the request info is here
	var pathname = url_info.pathname; //the address
	var params = url_info.query; //the parameters
	Mitsuba.onRequest( request, response );
});

server.on("error", function(err){
	console.log("Error: Port ",port," is in use.");
	process.exit();
});

server.listen( port, function() {
	console.log("Server ready in port", port );
});

//WS REQUESTS
var WebSocketServer = require('websocket').server;
wsServer = new WebSocketServer({ // create the server
    httpServer: server //if we already have our HTTPServer in server variable...
});
wsServer.on('request', function(request) {
	//accept all connections
    var connection = request.accept( null, request.origin );

	//create client
	var client = Mitsuba.onClientJoin( connection );

	//when users send message
    connection.on('message', function( message ) {
		if( message.type == "utf8" )
			client.onMessage( JSON.parse( message.utf8Data ) );
		else if( message.type == "binary" )
			client.onBinary( message.binaryData );
		else
			console.log("unknown message format:", message.type );
    });

	//user leaves
    connection.on('close', function(reason) {
		if(reason == 1009)
			console.log("connection closed: data too long");
		console.log("User gone, close code:",reason);// close user connection
		Mitsuba.onClientLeave( client );
    });
});


//START GAME ******************************
Mitsuba.start();

//input
/* this causes problem in nohup mode
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


rl.on('line', (answer) => {
  MAZrServer.onCommand( answer );
});
rl.on('pause', () => {
  MAZrServer.finish();
  server.close();
  rl.close();
  process.exit();
});
*/
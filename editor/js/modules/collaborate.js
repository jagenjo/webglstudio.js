var CollaborateModule = {
	name: "Collaborate",
	enabled: false,
	server: null,
	connected: false,

	username: "",
	room_name: "",
	server_host: null,
	server_port: 0,
	default_port: 55000,
	actions: {},

	log_history: [],
	max_history: 100,

	settings: {
		show_cameras: true,
		username: "",
	},

	init: function()
	{
		this.room_name = ((performance.now()*100000)|0).toString(36);
		this.log("Not connected...");
	},

	renderView: function(e, camera)
	{
		if( !EditorView.render_helpers || RenderModule.render_settings.in_player || !RenderModule.frame_updated )
			return;
	},

	request: function( action, user )
	{
		if(!this.connected || !user )
			return this.log("not connected");

		if(action == "download")
		{
			this.server.sendMessage( { action: "request_download" }, user.id );		
		}
		else if(action == "upload")
		{
			this.sendSceneTo( user.id );
		}
	},

	onServerMessage: function( author_id, packet )
	{
		if(!this.server || !this.connected)
			return; //impossible

		var user = this.server.clients[ author_id ];
		var time = getTime();

		switch( packet.action )
		{
			case "chat":
				this.log( { type: "chat", user_id: user.id, username: user.name, content: packet.param } );
				break;
			case "enter":
			case "setname":
				if(user)
				{
					user.name = packet.username;
					if( packet.action == "enter" )
						this.log( { type: "connected", user_id: user.id, username: user.name } );
					else
						this.log( { type: "renamed", user_id: user.id, username: user.name } );
					this.onDataUpdated();
				}
				break;
			case "request_download":
				this.log( { type: "request", username: user.name, user_id: user.id, data: "scene" });
				this.sendSceneTo( user.id );
				break;
			case "set_scene":
				this.log( { type: "scene", username: user.name, user_id: user.id, scene: packet.scene });
				break;
			default:
				var callback = CollaborateWidget.actions[ packet.action ];
				if(callback)
					callback( author_id, packet, this );
				else
					console.log("Unknown collaborate action");
		}
	},

	connect: function( room_name )
	{
		if(!room_name)
			return;

		var that = this;
		this.connected = false;

		var server_host = this.server_host;
		if(!server_host)
			server_host = location.host;
		var url = server_host + ":" + (this.server_port || this.default_port);
		this.room_name = room_name;

		if(!this.server)
			this.server = new SillyClient();
		this.server.connect( url , "_WGLS_COLLABORATE_" + room_name );

		this.log("Connecting...");

		this.server.on_error = function(err){
			that.log("Error connecting");
		}

		this.server.on_ready = function(id){
			that.log("Connected!");
			if(!that.username)
				that.username = "user_" + id;
			that.server_id = id;
			that.connected = true;
			that.server.clients[ that.server.user_id ].name = that.username;
			that.onDataUpdated();
			this.sendMessage( { action: "enter", username: that.username } );
		}

		this.server.on_user_connected = function(id){
			//that.onDataUpdated();
			this.sendMessage( { action: "enter", username: that.username }, id );
		};

		this.server.on_user_disconnected = function(id){
			var user = this.clients[ id ];
			if(!user)
				return;
			that.log( { type: "disconnected", username: user.name } );
		};

		this.server.on_close = function(){
			that.log("Disconnected");
			that.server_id = null;
			that.connected = false;
			that.onDataUpdated();
		}

		this.server.on_message = function(author_id, msg)
		{
			var packet = JSON.parse(msg);
			that.onServerMessage( author_id, packet );
		}
	},

	sendSceneTo: function( user_id )
	{
		var scene_info = JSON.stringify( LS.GlobalScene.serialize() );
		this.server.sendMessage( { action: "set_scene", scene: scene_info }, user_id );
	},

	disconnect: function()
	{
		if(!this.server)
			return;
		this.server.close();
		this.connected = false;
		this.server_id = null;
		this.log("Disconnected");
	},

	getUsers: function()
	{
		if(!this.connected)
			return [];
		return this.server.clients;
	},

	onCommand: function( command )
	{
		if(command == "/clear")
		{
			this.log_history.length = 0;
			this.onDataUpdated( "log" );
		}
	},

	sendChat: function( text )
	{
		if( !this.server || !this.connected )
			return this.log( "not connected" );

		var packet = {
			action: "chat",
			username: this.username,
			param: text
		};

		this.server.sendMessage( JSON.stringify(packet) );
	},

	log: function( msg )
	{
		if(!msg)
			return;

		if( msg.constructor === String )
			msg = { type: 0, content: msg };

		//console.log(msg);
		this.log_history.push( msg );
		if( this.log_history.length > this.max_history )
			this.log_history.shift();

		LiteGUI.trigger( this, "log_message", msg );
	},

	onDataUpdated: function( info )
	{
		LiteGUI.trigger( this, "data_updated", info );
	}
};


CORE.registerModule( CollaborateModule );
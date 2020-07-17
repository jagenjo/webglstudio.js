var CollaborateModule = {

	name: "Collaborate",
	enabled: false,
	server: null,
	connected: false,

	current_username: "",
	room_name: "",
	actions: {},

	user_selected: null,

	refresh_rate: 400, //ms

	log_history: [],
	max_history: 100,

	preferences: {
		server_url: "",
		username: ""
	},

	settings: {
		show_cameras: true,
		lock_camera: false
	},

	init: function()
	{
		this.room_name = ((performance.now()*100000)|0).toString(36);
		this.log("Not connected...");

		LiteGUI.bind( CORE, "user_action", function(e){
			CollaborateModule.onUserAction(e.detail);
		});

		LiteGUI.bind( CORE, "after_user_action", function(e){
			CollaborateModule.onUserAction(e.detail);
		});
	},

	renderView: function(e, camera)
	{
		if( !this.connected || !EditorView.render_helpers || RenderModule.render_settings.in_player || !RenderModule.frame_updated )
			return;

		var ctx = gl;
		ctx.start2D();
		ctx.fillStyle = "red";

		if(this.preferences.show_cameras)
			for(var i in this.server.clients)
			{
				var user = this.server.clients[i];
				var info = user.info;
				if(!info || user.id == this.server.user_id )
					continue;

				var pos = camera.project( info.camera.eye );
				ctx.fillRect( pos[0], gl.viewport_data[3] - pos[1], 10,10 );

				/*
				LS.Draw.push();
				LS.Draw.translate( info.camera.eye );
				LS.Draw.renderSolidSphere(1);
				LS.Draw.pop();
				*/
			}
		ctx.finish2D();
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
			case "user_info":
				//info about user view
				user.info = packet.info;
				if(this.preferences.lock_camera && this.user_selected && user.id == this.user_selected.id )
					this.viewFromUserCamera(user);
				break;
			case "user_action":
				this.onRemoteUserAction( packet.info, user );
				break;
			default:
				var callback = CollaborateModule.actions[ packet.action ];
				if(callback)
					callback( author_id, packet, this );
				else
					console.log("Unknown collaborate action");
		}
	},

	viewFromUserCamera: function( user )
	{
		var user_data = this.server.clients[ user.id ];
		if(!user_data || !user_data.info || !user_data.info.camera )
			return;

		var camera = RenderModule.getActiveCamera();
		camera.configure( user_data.info.camera );
		LS.GlobalScene.requestFrame();
	},

	connect: function( room_name )
	{
		if(!room_name)
		{
			this.log("Error, room name missing");
			return;
		}

		var that = this;
		this.connected = false;

		var server_url = this.preferences.server_url;
		if(!server_url)
		{
			if( CORE.config.sillyserver_url )
				server_url = CORE.config.sillyserver_url;
			else
				server_url = location.host + ":55000";
		}
		this.room_name = room_name;

		if(!this.server)
			this.server = new SillyClient();
		this.server.connect( server_url , "_WGLS_COLLABORATE_" + room_name );

		this.log("Connecting to " + server_url + " ...");

		this.server.on_error = function(err){
			that.log("Error connecting");
		}

		this.server.on_room_info = this.onConnected.bind(this);

		this.server.on_user_connected = function(id){
			//that.onDataUpdated();
			this.sendMessage( { action: "enter", username: that.preferences.username }, id );
		};

		this.server.on_user_disconnected = this.onDisconnected.bind(this);

		this.server.on_close = function(){
			that.log("Disconnected");
			that.server_id = null;
			that.user_selected = null;
			that.connected = false;
			that.onDataUpdated();
		}

		this.server.on_message = function(author_id, msg)
		{
			var packet = JSON.parse(msg);
			that.onServerMessage( author_id, packet );
		}
	},

	onConnected: function(info)
	{
		this.log("Connected!");
		var id = this.server.user_id;
		this.current_username = this.preferences.username;
		if(!this.current_username)
			this.current_username = "user_" + id;
		this.server_id = id;
		this.connected = true;
		this.server.clients[ this.server.user_id ].name = this.current_username;
		this.onDataUpdated();
		this.server.sendMessage( { action: "enter", username: this.current_username } );
		var min_user = this.getMainUser();
		if( min_user && min_user.id != this.server.user_id )
		{
			this.log("Requesting scene to " + min_user.id );
			this.server.sendMessage( { action: "request_download", data: "scene", username: this.current_username }, min_user.id );
		}
		else
			this.log("You are the first user in the room.");

		LEvent.bind( LS.Renderer, "renderHelpers", this.renderView, this );
		//LEvent.bind( LS.Renderer, "renderPicking", this.renderPicking, this );

		if(this._timer)
			clearInterval( this._timer );
		this._timer = setInterval( this.onTick.bind(this), this.refresh_rate );
	},

	onDisconnected: function( id )
	{
		var user = this.server.clients[ id ];
		if(!user)
			return;
		if(this.user_selected && this.user_selected.id == id)
			this.user_selected = null;
		that.log( { type: "disconnected", username: user.name } );
		LEvent.unbind( LS.Renderer, "renderHelpers", this.renderView, this );
		//LEvent.unbind( LS.Renderer, "renderPicking", this.renderPicking, this );
		clearInterval( this._timer );
	},

	onTick: function()
	{
		if(!this.connected || this.server.num_clients < 2)
			return;

		if(!this._user_info)
			this._user_info = {
			camera: {
				eye: [0,0,0],
				center: [0,0,0],
				fov: 90,
				type: 1
			}
		};

		//lightweight version
		var info = this._user_info;

		var camera = RenderModule.getActiveCamera();
		if(camera)
		{
			camera.getEye( info.camera.eye );
			camera.getCenter( info.camera.center );
			info.camera.fov = camera.fov;
			info.camera.type = camera.type;
		}

		this.server.sendMessage( { action: "user_info", info: info } );
		LS.GlobalScene.requestFrame();
	},

	sendSceneTo: function( user_id )
	{
		var scene_info = JSON.stringify( LS.GlobalScene.serialize() );
		this.server.sendMessage( { action: "set_scene", scene: scene_info }, user_id );
	},

	requestScene: function()
	{
		var min_user = this.getMainUser();
		if( min_user && min_user.id != this.server.user_id )
		{
			this.log("Requesting scene to " + min_user.id );
			this.server.sendMessage( { action: "request_download", data: "scene", username: this.username }, min_user.id );
		}
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

	getMainUser: function()
	{
		if(!this.connected)
			return null;
		var min = null;
		for(var i in this.server.clients)
		{
			var user = this.server.clients[i];
			var id = Number(user.id);
			if( !min || (id < Number(min.id) && id != this.user.id) )
				min = user;
		}
		return min;
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
	},

	//called from user_action and after_user_action
	onUserAction: function( action )
	{
		//console.log( action );

		if(!this.connected)
			return;

		var action_info = {
			type: action[0]
		};

		switch(action[0])
		{
			case "scene_modified": 
				action_info.data = LS.GlobalScene.serialize();
				break;
			case "node_created":
				action_info.data = action[1].serialize();
				break;
			case "node_renamed":
				var node = action[1];
				if(node)
					action_info.data = { uid: node.uid, name: node.name };
				break;
			case "node_parenting":
				var node = action[1];
				var parent = action[2];
				var index = -1;//parent.childNodes.indexOf( node );
				if(node && parent)
					action_info.data = { uid: node.uid, parent_uid: parent.uid, index: index };
				break;
			case "node_deleted":
				var node = action[1];
				if(node)
					action_info.data = node.uid;
				break;
			case "selection_removed":
				var uids = [];
				var selection = action[1];
				for(var i in selection)
					uids.push({ uid: selection[i].uid, comp_class: selection[i].comp_class });
				action_info.data = uids;
				break;
			case "node_transform":
				var node = action[1];
				action_info.node_uid = node.uid;
				action_info.data = typedArrayToArray( node.transform.data );
				break;
			case "nodes_transform":
				action_info.data = [];
				for(var i in action[1])
				{
					var node = action[1][i];
					if(node.transform)
						action_info.data.push([ node.uid, typedArrayToArray( node.transform.data ) ]);
				}
				break;
			case "material_changed":
				var material = action[1];
				action_info.material_fullpath = material.fullpath;
				action_info.material = material.serialize();
				if( material._root )
					action_info.node_uid = material._root.uid;
				break;
			case "node_material_assigned":
				var node = action[1];
				var material = action[2];
				action_info.node_uid = node.uid;
				action_info.material = (material && material.serialize) ? material.serialize() : material; //inline materials, strings or nulls
				break;
			case "component_created":
			case "component_changed":
				var component = action[1];
				var node = component._root;
				if(!node) //this happens when is something related to the root node ??
					return;
				action_info.node_uid = node.uid;
				action_info.component = component.serialize();
				action_info.component_index = node.getIndexOfComponent( component );
				break;
			case "component_deleted":
				var component = action[1];
				var node = component._root;
				action_info.node_uid = node.uid;
				action_info.component_uid = component.uid;
				break;
			case "nodes_cloned":
				var info = action[1];
				var data = [];
				for(var i = 0; i < info.uids.length; ++i)
				{
					var uid = info.uids[i];
					var node = LS.GlobalScene.getNode( uid );
					if(!node)
						continue;
					data.push({uid: uid, data: node.serialize(), parent_uid: node.parentNode.uid });
				}
				action_info.data = data;
				break;
		}

		if(!action_info)
			return;
		this.server.sendMessage( { action: "user_action", info: action_info } );
	},
	
	onRemoteUserAction: function( action, user )
	{
		if(!this.connected)
			return;

		var log_action = true;
		var log_param = "";

		switch( action.type )
		{
			case "scene_modified": 
				LS.GlobalScene.configure( action.data );
				break;
			case "node_created":
				var node = new LS.SceneNode();
				node.configure( action.data );
				LS.GlobalScene.root.addChild( node );
				break;
			case "node_renamed":
				var node = LS.GlobalScene.getNodeByUId( action.data.uid );
				if(node)
					node.name = action.data.name;
				break;
			case "node_deleted":
				var node = LS.GlobalScene.getNodeByUId( action.data );
				if(node)
					node.parentNode.removeChild( node );
				break;
			case "node_parenting":
				var node = LS.GlobalScene.getNodeByUId( action.data.uid );
				var parent = LS.GlobalScene.getNodeByUId( action.data.parent_uid );
				if(node && parent)
					parent.addChild( node, action.data.index );
				break;
			case "selection_removed":
				for(var i in action.data)
				{
					var info = action.data[i];
					if( info.comp_class ) //component
					{
						var comp = LS.GlobalScene.findComponentByUId( info.uid );
						if(comp && comp._root)
							comp._root.removeComponent( comp );
					}
					else //node
					{
						var node = LS.GlobalScene.getNodeByUId( info.uid );
						if(node)
							node.parentNode.removeChild( node );
					}
				}
				break;
			case "node_transform": 
				var node = LS.GlobalScene.getNode( action.node_uid );
				if(node && node.transform)
					node.transform.data = action.data;
				break;
			case "nodes_transform": 
				for(var i in action.data )
				{
					var node = LS.GlobalScene.getNode( action.data[i][0] );
					if(node && node.transform)
						node.transform.data = action.data[i][1];
				}
				break;
			case "node_material_assigned":
				var node = LS.GlobalScene.getNode( action.node_uid );
				if(!node)
					return;
				var material = null;
				if(action.material ) 
				{
					if( action.material.material_class ) //inline material
					{
						material = new LS.MaterialClasses[ action.material.material_class ];
						material.configure( action.material );
					}
					else //resource material
					{
						LS.RM.load( action.material );
						material = action.material;
					}
				}
				node.material = material;
				break;
			case "material_changed":
				var node = null;
				if( action.node_uid )
					node = LS.GlobalScene.getNode( action.node_uid );

				if( node && node.material )
				{
					node.material.configure( action.material );
					return;
				}

				LS.RM.load( action.material_fullpath, function(material){
					if( material )
						material.configure( action.material );
				});
				break;
			case "component_created":
				var node = LS.GlobalScene.getNode( action.node_uid );
				if(!node)
					return;
				var component_info = action.component;
				var component_ctor = LS.Components[ component_info.object_class ];
				if(!component_ctor)
					return;
				var component = new component_ctor();
				component.configure( component_info );
				node.addComponent( component, action.component_index );
				break;
			case "component_changed":
				var node = LS.GlobalScene.getNode( action.node_uid );
				if(!node)
					return;
				var component_info = action.component;
				var component = node.getComponentByUId( component_info.uid );
				if(!component)
					return;
				component.configure( component_info );
				log_param = " to component " + LS.getObjectClassName( component );
				break;
			case "component_deleted":
				var node = LS.GlobalScene.getNode( action.node_uid );
				if(!node)
					return;
				var component_info = action.component;
				var component = node.getComponentByUId( component_info.uid );
				if(!component)
					return;
				node.removeComponent( component );
				log_param = " to component " + LS.getObjectClassName( component );
				break;
			case "nodes_cloned":
				var nodes = action.data;
				for(var i = 0; i < nodes.length; ++i)
				{
					var node_info = nodes[i];
					var node = LS.GlobalScene.getNode( node_info.uid );
					if(node)
						continue;
					var parent = LS.GlobalScene.getNode( node_info.parent_uid );
					if(!parent)
						continue;
					node = new LS.SceneNode();
					parent.addChild( node );
					node.configure( node_info.data );
				}
				break;
		}

		if(log_action)
		{
			var event = { type: "user_action", user_id: user.id, username: user.name, content: action.type + log_param };
			if( ! this._last_event || (this._last_event && JSON.stringify( this._last_event ) != JSON.stringify( event )) )
				this.log( event );
			this._last_event = event;
		}

		LS.GlobalScene.requestFrame();
	}
};


CORE.registerModule( CollaborateModule );
function CollaborateWidget( options )
{
	options = options || {};
	this.options = options;
	this.module = CollaborateModule;

	this.root = LiteGUI.createElement( "div", null, null, { width:"100%", height:"100%" } );

	if( !CollaborateWidget._added_css )
	{
		LiteGUI.addCSS("\
			.collaborate-panel .chatlog { overflow: auto; }\
			.collaborate-panel .msg { display: block; color: #666; padding-left: 10px; padding-top: 4px; margin: 0; } \
			.collaborate-panel .msg.me { color: white; } \
			.collaborate-panel .msg .username { color: #5FA; } \
			.collaborate-panel .msg .link { color: #5AF; cursor: pointer; } \
			.collaborate-panel .msg .danger { color: #d63422; } \
			.collaborate-panel .msg .content { color: #DDD; } \
			.collaborate-panel .msg .action { color: #999; } \
			.collaborate-panel input { font-size: 20px; padding-left: 8px; } \
			.collaborate-panel input::-webkit-input-placeholder { opacity: 0.3; }\
		");
		CollaborateWidget._added_css = true;
	}


	if(!CollaborateModule.script_loaded)
	{
		CollaborateModule.script_loaded = true;
		LiteGUI.requireScript("js/extra/sillyclient.js", this.init.bind(this) );
	}
	else
		this.init();

	this.user_selected = null;
	var that = this;

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		that.bindEvents(); 
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		that.unbindEvents();
	});
}

CollaborateWidget.widget_name = "Collaborate";

CollaborateWidget.prototype.init = function()
{
	var that = this;

	var area = this.area = new LiteGUI.Area();
	area.split("horizontal",[250,null], { resizable: true } );
	this.root.appendChild( area.root );

	//inspector
	this.inspector = new LiteGUI.Inspector({ width: "100%", height: "100%"});
	this.area.getSection(0).add( this.inspector );
	this.updateWidgets();

	//panel
	this.panel = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });
	this.area.getSection(1).add( this.panel );
	this.panel.style.backgroundColor = "black";
	this.panel.classList.add("collaborate-panel");
	this.chatlog = LiteGUI.createElement("div",".chatlog",null,{ width:"100%", height:"calc( 100% - 30px )" });
	this.panel.appendChild( this.chatlog );

	//input
	this.text_input = LiteGUI.createElement("input",null,null,{ width:"100%", height:"30px" });
	this.text_input.setAttribute("placeHolder","type here...");
	this.panel.appendChild( this.text_input );
	this.text_input.addEventListener("keydown", function(e){
		if(e.keyCode != 13 || !this.value)
			return;
		that.log( { type: "typed", content: this.value } );
		if(this.value[0] == "/")
			that.module.onCommand( this.value );
		else
			that.module.sendChat( this.value );
		this.value = "";
		e.preventDefault();
	});

	this.refreshLog();
}

CollaborateWidget.prototype.log = function(a,b)
{
	this.module.log(a,b);
}

CollaborateWidget.prototype.sendChat = function(text)
{
	this.module.sendChat(text);
}

CollaborateWidget.prototype.updateWidgets = function()
{
	var that = this;
	var module = that.module;

	var inspector = this.inspector;
	inspector.clear();
	//inspector.addTitle("Collaborate");
	inspector.addString("Username", module.username, { callback: function(v){
		if(!v)
			return;
		module.username = v;
		if(module.connected)
		{
			module.server.clients[ module.server.user_id ].name = v;
			module.server.sendMessage( { action: "setname", username: module.username } );
			that.updateWidgets();
		}
	}});
	inspector.addString("Room", module.room_name, { disabled: module.connected, callback: function(v){
		module.room_name = v;
	}});
	inspector.addButton( null, module.connected ? "Disconnect from server" : "Connect to server", function(){
		if(!module.connected)
			module.connect( module.room_name );
		else
			module.disconnect();
		that.updateWidgets();
	});

	var users = module.getUsers();
	var values = [];
	for(var i in users)
		values.push( { content: users[i].name || i, id: i, user: users[i] } );

	inspector.addList(null, values, { height: 100,
		selected: this.user_selected,
		callback: function(v)
		{
			that.user_selected = v.user;
		}
	});

	inspector.addButtons("Scene",["Download","Upload"], { callback: function(v){
		if(v == "Download")
			module.requestScene();
		else if(v == "Upload")
			module.sendSceneTo();
	}});

	inspector.addCheckbox("Show Cameras", module.show_cameras, function(v){
		module.show_cameras = v;
	});
}

CollaborateWidget.prototype.bindEvents = function()
{
	this._log_message_callback = this.onLogMessage.bind( this );
	this._data_updated_callback = this.onDataUpdated.bind( this );

	LiteGUI.bind( this.module, "log_message", this._log_message_callback );
	LiteGUI.bind( this.module, "data_updated", this._data_updated_callback );
	
}

CollaborateWidget.prototype.unbindEvents = function()
{
	LiteGUI.unbind( this.module, "log_message", this._log_message_callback );
	LiteGUI.unbind( this.module, "data_updated", this._data_updated_callback );
}

CollaborateWidget.prototype.onLogMessage = function(e)
{
	this.addLogMessage( e.detail );
}

CollaborateWidget.prototype.addLogMessage = function(msg)
{
	var that = this;
	var elem = document.createElement("span");
	elem.classList.add("msg");

	switch( msg.type )
	{
		case "connected":
			elem.innerHTML = "<span class='username'>" + msg.username + "</span> connected.";
			break;
		case "disconnected":
			elem.innerHTML = "<span class='username'>" + msg.username + "</span> disconnected.";
			break;
		case "renamed":
			elem.innerHTML = "<span class='username'>" + msg.username + "</span> changed its name.";
			break;
		case "chat":
			elem.innerHTML = "<span class='username'>" + msg.username + "</span> says <span class='content'></span>";
			elem.querySelector(".content").innerText = msg.content;
			break;
		case "request":
			elem.innerHTML = "<span class='username'>" + msg.username + "</span> requested <span class='content'></span>";
			elem.querySelector(".content").innerText = msg.data;
			break;
		case "typed":
			elem.innerText = "] " + msg.content;
			elem.classList.add("me");
			break;
		case "scene":
			elem.innerHTML = "<span class='username'>" + msg.username + "</span> send you his scene. <span class='link'>Click here</span> to download. <span class='danger'>NEVER DOWNLOAD SCENES FROM UNTRUSTED USERS</span>.";
			elem.querySelector(".link").onclick = function(){
				LS.GlobalScene.setFromJSON( JSON.parse( msg.scene ) );
				that.sendChat("scene loaded.");
			}
			break;
		case "user_action":
			elem.innerHTML = "<span class='username'>" + msg.username + "</span> action: <span class='content action'></span>";
			elem.querySelector(".content").innerText = msg.content;
			break;
		default:
			if(msg.content)
				elem.innerText = msg.content;
	}

	this.chatlog.appendChild( elem );
	this.chatlog.scrollTop = 100000;
}

CollaborateWidget.prototype.refreshLog = function(e)
{
	this.chatlog.innerHTML = "";
	for(var i in this.module.log_history)
		this.addLogMessage( this.module.log_history[i] );
}

CollaborateWidget.prototype.onDataUpdated = function(e)
{
	var info = e.detail;

	if( info == "log" )
		this.refreshLog();
	else
		this.updateWidgets();
}

CORE.registerWidget( CollaborateWidget );

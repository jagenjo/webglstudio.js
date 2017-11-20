function ConsoleWidget( options )
{
	options = options || {};
	this.options = options;

	this.history = [];
	this.post_history = [];

	this.root = LiteGUI.createElement( "div", ".console-panel", null, { width:"100%", height:"100%" } );

	if( !ConsoleWidget._added_css )
	{
		LiteGUI.addCSS("\
			.console-panel { background-color: black; overflow: hidden; height: 100%; }\
			.console-log { overflow: auto; height: 100%; }\
			.console-panel .msg { display: block; color: #666; padding-left: 20px; padding-top: 4px; margin: 0; } \
			.console-panel .msg.me { color: white; } \
			.console-panel .msg .username { color: #5FA; } \
			.console-panel .msg .link { color: #5AF; cursor: pointer; } \
			.console-panel .msg .danger { color: #d63422; } \
			.console-panel .msg .content { color: #DDD; } \
			.console-panel .msg .action { color: #999; } \
			.console-panel .methods { color: #9FF; } \
			.console-panel li { margin-left: 1em; height: 1.2em; overflow: hidden; padding-left: 1em; } \
			.console-panel .method { color: #00c2ff;  } \
			.console-panel .params { color: #eee;  } \
			.console-panel .property { color: #48ec83;  } \
			.console-panel input { background-color: #111; font-size: 20px; padding-left: 8px; } \
			.console-panel input::-webkit-input-placeholder { opacity: 0.3; }\
		");
		ConsoleWidget._added_css = true;
	}

	if(!ConsoleWidget.script_loaded)
	{
		ConsoleWidget.script_loaded = true;
		//LiteGUI.requireScript("js/extra/sillyclient.js", this.init.bind(this) );
	}

	this.init();

	var that = this;

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		that.bindEvents(); 
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		that.unbindEvents();
	});

	ConsoleWidget.commands["clear"] = function(a,console_widget)
	{
		console_widget.clear();
	}

	ConsoleWidget.commands["log"] = function(a,console_widget)
	{
		if(!console._log)
		{
			var avoid_recursive = false;
			console._log = console.log;
			console.log = function(v,b)
			{
				if(avoid_recursive)
					return;
				avoid_recursive = true;
				v = String(v);
				if( b && v && v.indexOf("%c") != -1 )
				{
					v = v.split("%c").join("");
					var elem = console_widget.log( v );
					elem.setAttribute("style",b);
				}
				else
					var elem = console_widget.log( v );
				avoid_recursive = false;
			}
			console_widget.log("login console: on");
		}
		else
		{
			console.log = console._log;
			delete console._log;
			console_widget.log("login console: off");
		}
	}


	if(!LS.Documentation)
	{
		LS.Documentation = { classes: {}, flat_classes: {} }; //placeholder
		LiteGUI.requestJSON( location.protocol + "//" + ConsoleWidget.lsdoc_json, function(d){
			LS.Documentation = d;
			LS.Documentation.flat_classes = {};
			for(var i in d.classes )
			{
				var shortname = d.classes[i].shortname;
				var index = shortname.lastIndexOf(".");
				shortname = shortname.substr( index + 1 );
				LS.Documentation.flat_classes[ shortname ] = d.classes[i];
			}

			for(var i in d.classitems )
			{
				var item = d.classitems[i];
				var class_info = d.classes[ item["class"] ];
				if(!class_info) //namespaces also have entries without class
					continue;
				if( !class_info.properties )
					class_info.properties = {};
				class_info.properties[ item.name ] = item;
			}

		});
	}
}

ConsoleWidget.lsroot_doc = "webglstudio.org/doc/litescene/classes/";
ConsoleWidget.lsdoc_json = "webglstudio.org/doc/litescene/data.json";
ConsoleWidget.commands = {};
ConsoleWidget.special_objects = new Map();

ConsoleWidget.widget_name = "Console";

ConsoleWidget.prototype.init = function()
{
	var that = this;

	this.console_log = LiteGUI.createElement("div",".console-log",null,{ width:"100%", height:"calc( 100% - 36px )" });
	this.root.appendChild( this.console_log );

	//input
	this.text_input = LiteGUI.createElement("input",null,null,{ width:"100%", height:"30px" });
	this.text_input.setAttribute("placeHolder","type class name here...");
	this.root.appendChild( this.text_input );
	this.text_input.addEventListener("keydown", inner_keydown );

	var that = this;

	function inner_keydown(e){

		if( e.keyCode == 38 ) //cursor up
		{
			if(that.history.length)
			{
				this.value = that.history.pop();
				that.post_history.push( this.value );
			}
			e.preventDefault();
			return;
		}

		if( e.keyCode == 40 ) //cursor down
		{
			if(!that.post_history.length)
			{
				this.value = "";
			}
			else
			{
				this.value = that.post_history.pop();
				that.history.push( this.value );
			}
			e.preventDefault();
			return;
		}


		if(e.keyCode != 13 || !this.value)
			return;
		that.log( { type: "typed", content: this.value } );

		that.history = that.history.concat( that.post_history.reverse() );
		that.post_history.length = 0;
		that.history.push( this.value );
		that.onCommand( this.value );
		this.value = "";
		e.preventDefault();
	}
}

ConsoleWidget.prototype.clear = function()
{
	this.console_log.innerHTML = "";
}

ConsoleWidget.prototype.log = function( msg )
{
	if(!msg)
		return;

	if(msg.constructor === String)
		msg = { type: "system", content: msg };

	var elem = document.createElement("span");
	elem.classList.add("msg");

	switch( msg.type )
	{
		case "typed":
			elem.innerText = "] " + msg.content;
			elem.classList.add("me");
			break;
		case "error":
			elem.innerHTML = "<span class='danger'>" + msg.content + "</span>";
			break;
		case "method":
			var link = "http://" + ConsoleWidget.lsroot_doc + "LS.";
			if( msg.classtype == "component" )
				link += "Components.";
			link += msg.classname + ".html#method_" + msg.name;
			var description = "";
			if( msg.description )
				description = msg.description;
			elem.innerHTML = "<li><span class='method'><a href='"+link+"' target='_blank'>" + msg.name + "</a></span>(<span class='params'>"+(msg.params || "")+"</span>) "+description+"</li>";
			break;
		case "property":
			elem.innerHTML = "<li><span class='property'>" + msg.name + "</span></li>";
			break;
		case "system":
		default:
			if(msg.content)
				elem.innerHTML = msg.content;
	}

	this.console_log.appendChild( elem );
	this.console_log.scrollTop = 100000;
	return elem;
}

ConsoleWidget.prototype.logObject = function( obj, cmd )
{
	var that = this;
	var classname = LS.getObjectClassName( obj );

	if( classname !== "Object" )
	{
		this.logClass( classname );
		return;
	}

	//regular object
	var info = ConsoleWidget.special_objects.get( obj );
	if(info)
	{
		//TODO
		//return
	}

	var elem = this.log("Object [<a href='#' class='show methods'>methods</a>].");
	if(elem)
		elem.querySelector(".methods").addEventListener("click", inner_objectmethods );

	function inner_objectmethods(e){
		that.logClassMethods( classname, class_info );
		e.preventDefault();
		return true;
	}

}

ConsoleWidget.prototype.logFunction = function( obj, cmd )
{
	var classname = LS.getClassName( obj );
	this.logClass( classname );
}

ConsoleWidget.prototype.logClass = function( classname, cmd )
{
	var that = this;
	var class_info = LS.Documentation ? LS.Documentation.flat_classes[ classname ] : null;
	var elem = null;
	if( class_info ) //Using the info from the doxygen doc
	{
		var link = "http://" + ConsoleWidget.lsroot_doc + "" + class_info.namespace + "." + classname + ".html";
		elem = this.log("<a href='"+link+"' target='_blank'>"+class_info.name+"</a> "+ class_info.description +" [<a href='#' class='methods'>methods</a>].");
	}
	else //guessing from the code
	{
		if( LS.Components[ classname ] )
		{
			var link = "http://" + ConsoleWidget.lsroot_doc + "LS.Components." + classname + ".html";
			elem = this.log("<a href='"+link+"' target='_blank'>LS.Components."+classname+"</a> [<a href='#' class='methods'>methods</a>].");
		}
		else if( LS[ classname ] )
		{
			var link = "http://" + ConsoleWidget.lsroot_doc + "LS." + classname + ".html";
			elem = this.log("<a href='"+link+"' target='_blank'>LS."+classname+"</a>  [<a href='#' class='methods'>methods</a>].");
		}
		else
		{
			this.log( classname );
			return false;
		}
	}

	if(elem)
		elem.querySelector(".methods").addEventListener("click",  inner_classmethods );

	function inner_classmethods(e){
		that.logClassMethods( classname, class_info );
		e.preventDefault();
		return true;
	}

	return true;
}

ConsoleWidget.prototype.logClassMethods = function( classname, class_info )
{
	var type = null;
	var ctor = null;

	//get ctor
	if( LS.Components[ classname ] )
	{
		ctor = LS.Components[ classname ];
		type = "component";
	}
	else if( LS.MaterialClasses[ classname ] )
	{
		ctor = LS.MaterialClasses[ classname ];
		type = "material";
	}
	else if( LS.ResourceClasses[ classname ] )
	{
		ctor = LS.ResourceClasses[ classname ];
		type = "resource";
	}
	else if( LS[ classname ] )
	{
		ctor = LS[ classname ];
		type = "system";
	}
	else
		return; //nothing found

	//methods
	for(var i in ctor.prototype )
	{
		var desc = Object.getOwnPropertyDescriptor(ctor.prototype, i);
		if( !ctor.prototype.hasOwnProperty( i ) )
			continue;
		if(desc && desc.get )
			this.log({type: "property", name: i, class_ctor: ctor, classname: classname, classtype: type });
		else
		{
			var func_code = ctor.prototype[i].toString();
			var index = func_code.indexOf("(") + 1;
			var index2 = func_code.indexOf(")");
			var params = func_code.substr( index, index2 - index );

			var description = "";

			if( class_info && class_info.properties[ i ] )
				description = class_info.properties[ i ].description;
			this.log({type: "method", name: i, class_ctor: ctor, classname: classname, classtype: type, description: description, func: ctor.prototype[i], params: params });
		}
	}
}

ConsoleWidget.prototype.logMethods = function( object )
{
	var that = this;

	//methods
	for(var i in object )
	{
		var value = object[i];
		if( value === undefined || value === null )
			continue;
		var ctor = value.constructor;
		var classname = LS.getClassName( ctor );

		var elem = null;
		var class_info = LS.Documentation ? LS.Documentation.flat_classes[ classname ] : null;
		if( class_info ) //Using the info from the doxygen doc
		{
			var link = location.protocol + "//" + ConsoleWidget.lsroot_doc + "classes/" + class_info.namespace + "." + classname + ".html";
			elem = this.log("<a href='"+link+"' target='_blank'>"+class_info.name+"</a> "+ class_info.description +" [<a href='#' data-classname='"+classname+"' class='methods'>methods</a>].");
		}
		else if( value.constructor === Function )
		{
			var func_code = value.toString();
			var index = func_code.indexOf("(") + 1;
			var index2 = func_code.indexOf(")");
			var params = func_code.substr( index, index2 - index );
			var description = "";
			this.log({type: "method", name: i, params: params });
			continue;
		}
		else
			this.log({type: "method", name: i });
	}

	if(elem)
		elem.querySelector(".methods").addEventListener("click",  inner_classmethods );

	function inner_classmethods(e){
		var classname = this.dataset["classname"];
		var class_info = LS.Documentation ? LS.Documentation.flat_classes[ classname ] : null;
		that.logClassMethods( classname, class_info );
		e.preventDefault();
		return true;
	}
}

ConsoleWidget.prototype.onCommand = function(cmd)
{
	if(!cmd)
		return;

	if(cmd[0] == "/")
	{
		var command = ConsoleWidget.commands[ cmd.substr(1) ];
		if(!command)
			return this.log("Unknown command");
		command( cmd, this )
		return;
	}

	if(LS.Documentation)
	{
		var class_info = LS.Documentation.flat_classes[ cmd ];
		if( !class_info )
			class_info = LS.Documentation.classes[ cmd ];
		if( class_info )
		{
			this.logClass( cmd );
			return;
		}
	}

	//process command
	//*
	try
	{
		var r = eval( cmd );
		if( typeof(r) === "object" )
			this.logObject( r, cmd );
		else if( typeof(r) === "function" )
			this.logFunction( r, cmd );
		else
			this.log( String(r) );
	}
	catch (err)
	{
		this.log({ type: "error", content: err.toString() });
	}
	//*/
}

ConsoleWidget.prototype.bindEvents = function()
{
	this.log("Console enabled");
	LEvent.bind( LS, "code_error", this.onError, this );
	LEvent.bind( LS, "log", this.onLog, this );
	LEvent.bind( LS.RM, "resource_not_found", this.onResourceMissing, this );
}

ConsoleWidget.prototype.unbindEvents = function()
{
	LEvent.unbind( LS, "code_error", this.onError, this );
	LEvent.unbind( LS, "log", this.onLog, this );
}

ConsoleWidget.prototype.onLog = function(e, msg)
{
	this.log(msg);
}

ConsoleWidget.prototype.onError = function(e, err)
{
	//console.log(err);
	var error_message = err.error || err.message || "";
	if(error_message)
		error_message = String(error_message).split("\n").join("<br/>");

	if( error_message )
		this.log({ type: "error", content: error_message });
	if(err.resource)
		this.log({ type: "error", content: "Resource: " + ( err.resource.filename ) });
	if(err.node)
		this.log({ type: "error", content: "Script in Node: " + ( err.node.name ) });
}

ConsoleWidget.prototype.onResourceMissing = function(e, url)
{
	this.log({ type: "error", content: "Resource not found: " + url });
}

CORE.registerWidget( ConsoleWidget );

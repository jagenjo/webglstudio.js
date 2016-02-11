EVAL = function(code) { return new Function(code); } //done to have line number, do not move

function CodingPadWidget()
{
	this.root = null;
	this.autocompile = false; //assign code to component on every keystroke
	this.wrap_lines = false;
	this.editor = null;
	this.init();

	this._binded = false;
}

CodingPadWidget.widget_name = "Coding";

CORE.registerWidget( CodingPadWidget );

CodingPadWidget.prototype.init = function()
{
	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });
	
	//load codemirror
	if(typeof(CodeMirror) === undefined)
		console.warn("CodeMirror missing");
	else
		this.createCodingArea(); 

	var that = this;

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ that.bindEvents(); });
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		that.unbindEvents();
	});

	if(this.root._parentNode)
		this.bindEvents();
}

CodingPadWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title: CodingPadWidget.widget_name, fullcontent: true, closable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
	var coding_widget = new CodingPadWidget();
	dialog.add( coding_widget );
	dialog.coding_area = coding_widget;
	dialog.on_close = function()
	{
		coding_widget.unbindEvents();		
	}
	return dialog;
}

CodingPadWidget.prototype.bindEvents = function()
{
	if(this._binded)
		return;

	this._binded = true;
	LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload, this );
	LEvent.bind( LS.GlobalScene, "reload", this.onReload, this );
	LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved, this );
	LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved, this );
	LEvent.bind( LS.Components.Script, "renamed", this.onScriptRenamed, this );
	LEvent.bind( CodingPadWidget, "code_changed", this.onCodeChanged, this);

	LEvent.bind( LS.Components.Script, "code_error", this.onScriptError, this );
	LEvent.bind( LS, "exception", this.onGlobalError, this );
}

CodingPadWidget.prototype.unbindEvents = function()
{
	if(!this._binded)
		return;
	this._binded = false;
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS.Components.Script, this );
	LEvent.unbindAll( LS, this );
}

//where instance is the recipient of the code
CodingPadWidget.prototype.editInstanceCode = function( instance, options )
{
	options = options || {};
	var lang = options.lang || "javascript";

	//used when a tab is closed
	if(!instance)
	{
		this.current_code_info = null;
		this.editor.setValue("");
		return;
	}

	var current_code_info = this.current_code_info;

	//check if we are editing the current one
	if(current_code_info)
	{
		if(options.id && current_code_info.id == options.id)
			return;
		if(!options.id && current_code_info.instance == instance)
			return;
	}

	//adapt interface
	this.compile_button.style.display = (lang != "javascript") ? "none" : null;
	this.save_button.style.display = instance.fullpath ? null : "none";

	if(lang == "javascript" || lang == "glsl")
		this.editor.setOption( "mode", "javascript" );
	else
		this.editor.setOption( "mode", lang );

	//changing from one tab to another? save state of old tab
	if( current_code_info )
	{
		this.assignCurrentCode(true); //save the current state of the codemirror inside the instance (otherwise changes would be lost)
		//get cursor pos (line and char)
		//store in current_tab
	}

	this.replaceInstanceCode( instance, options );
}

CodingPadWidget.prototype.replaceInstanceCode = function( instance, options )
{
	options = options || {};
	var lang = options.lang || "javascript";

	//compute id
	var id = options.id || instance.uid || instance.id;
	var title = options.title || instance.name || id;

	//update coding context
	this.current_code_info = { id: id, instance: instance, options: options };
	var text_content = null;
	if(this.current_code_info.options.getCode)
		text_content = this.current_code_info.options.getCode();
	else if( instance.getCode )
		text_content = instance.getCode();
	else if( instance.getData )
		text_content = instance.getData();
	else
		text_content = instance.code;

	if(!text_content)
		text_content = "";

	if(this.editor)
	{
		this.editor.setValue( text_content );
		this.editor.refresh();
		if(this.current_code_info && this.current_code_info.pos)
			this.editor.setCursor( this.current_code_info.pos );
	}
	else
		console.warn("CodeMirror missing");

	//global assigments (used for the autocompletion)
	if(	instance && instance._root )
	{
		window.node = instance._root;
		window.component = instance;
		window.scene = window.node.scene;
	}
	else
	{
		window.node = null;
		window.component = null;
		window.scene = null;
	}
}

CodingPadWidget.prototype.onCodeChange = function( editor )
{
	if(this.autocompile)
		this.assignCurrentCode();
}

//puts the codemirror code inside the instance (component) and triggers event (which will evaluate it)
CodingPadWidget.prototype.assignCurrentCode = function( skip_events )
{
	var info = this.getCurrentCodeInfo();
	if(!info)
		return;

	var instance = info.instance;
	if( instance.constructor === String ) //uid
		instance = LS.GlobalScene.findComponentByUId( instance );

	if( !instance )
	{
		console.warn( "Instance being edited in coding pad not found" );
		return;
	}

	var uid = instance.uid;

	if(instance)
	{
		if( uid.substr(0,5) == "COMP-" && (!instance._root || !instance._root.scene) )
		{
			console.warn( "Instance being edited is not in the scene" );
			return;
		}
	}

	var text_content = this.editor.getValue();
	info.pos = this.editor.getCursor();

	var old_text_content = null;
	if(info.options.getCode)
		old_text_content = info.options.getCode();
	else if(info.options.getData)
		old_text_content = info.options.getData();
	else if(instance.getCode)
		old_text_content = instance.getCode();
	else if(instance.getData)
		old_text_content = instance.getData();
	else
		old_text_content = instance.code;

	if(text_content == old_text_content)
		return;

	if(info.options.setCode)
		info.options.setCode( text_content );
	else if(info.options.setData)
		info.options.setData( text_content );
	else if(instance.setCode)
		instance.setCode( text_content );
	else if(instance.setData)
		instance.setData( text_content );
	else
		instance.code = text_content;

	if(skip_events) 
		return true; 

	LEvent.trigger( instance, "code_changed", text_content );
	if( instance.onCodeChange )
		return instance.onCodeChange( text_content );
	LEvent.trigger( CodingPadWidget, "code_changed", info );
	return true;
}

CodingPadWidget.prototype.showInFooter = function(msg) {
	this.workarea.query(".code-footer").innerHTML = msg;
}

CodingPadWidget.prototype.getCurrentCodeInfo = function()
{
	return this.current_code_info;
}

CodingPadWidget.prototype.evalueCode = function()
{
	var info = this.getCurrentCodeInfo();
	if(!info)
		return;

	var lang = "javascript";
	if(info.options && info.options.lang)
		lang = info.options.lang;

	//non javascript? put the code inside the component and go
	if( lang != "javascript")
	{
		this.assignCurrentCode();
		return;
	}

	//Is JS, then try to evaluate it
	//create a foo class and try to compile the code inside to check that the sintax is correct
	var code = this.editor.getValue();

	try
	{
		this.last_executed_code = code;
		code = LScript.expandCode( code ); //multiline strings and other helpers
		EVAL(code); //this eval is in a line easier to control

		//no errors parsing (but there could be errors in execution)
		this.showInFooter("code ok");
		this.markLine(); 
	}
	catch (err)
	{
		//error parsing
		this.showError(err);
		return;
	}

	//put editor code in instance (it will be evaluated)
	this.assignCurrentCode(); //this will trigger the error handling during execution
}

CodingPadWidget.prototype.saveCode = function()
{
	var that = this;
	var info = this.getCurrentCodeInfo();
	if(!info)
		return;

	this.assignCurrentCode(true); //true? not sure

	if( info.instance && info.instance.constructor == LS.Resource )
	{
		DriveModule.saveResource( info.instance, function(){
			that.editor.focus();
			this.showInFooter("saved");
		}, { skip_alerts: true });
		this.showInFooter("saving...");
	}
	else
		this.showInFooter("stored");
}

CodingPadWidget.prototype.addBreakPoint = function()
{
	var info = this.getCurrentCodeInfo();
	if(!info)
		return;

	if(info.lang && info.lang != "javascript")
		return;

	var pos = this.editor.getCursor();
	pos.ch = 0;
	this.editor.replaceRange("{{debugger}}", pos, pos) 
}

CodingPadWidget.prototype.changeFontSize = function(num)
{
	var code_container = this.code_container;
	var root = code_container.querySelector(".CodeMirror");
	var size = root.style.fontSize;
	if(!size)
		size = 14;
	else
		size = parseInt(size);
	size += num;
	root.style.fontSize = size + "px";
}

//errors
CodingPadWidget.prototype.markLine = function(num)
{
	var cm = this.editor;

	if(typeof(num) == "undefined" && this.last_error_line != null)
	{
		var lines = cm.lineCount();
		for(var i = 0; i < lines; i++)
			cm.removeLineClass( i, "background", "error-line");
		//cm.removeLineClass( this.last_error_line, "background", "error-line");
		this.last_error_line = null;
		return;
	}

	if(typeof(num) != "undefined")
	{
		if(this.last_error_line != null)
			cm.removeLineClass( this.last_error_line, "background", "error-line");

		this.last_error_line = num;
		cm.addLineClass(num, "background", "error-line");
	}
}

//save the state 
CodingPadWidget.prototype.onBeforeReload = function(e)
{
	//console.log("before reload");
	this._saved_state = this.current_code_info;
}

	//reload all the codes open
CodingPadWidget.prototype.onReload = function(e)
{
	//console.log("reload");
	if(!this._saved_state)
		return;

	var state = this._saved_state;

	//refresh instance after reloading the scene 
	var instance = null;
	if( state.getInstance )
		instance = state.getInstance();
	if(!instance)
	{
		if( state.id.substr(0,6) == "@COMP-" )
			instance = LS.GlobalScene.findComponentByUId( state.id );
		else if( state.id.substr(0,6) == "@MAT-" )
			instance = LS.GlobalScene.findMaterialByUId( state.id );
	}
	if(instance)
		this.replaceInstanceCode( instance, state.options );
	else
		console.warn("CodingPad: cannot find instance by uid: " + state.uid );
	this._saved_state = null;
}

CodingPadWidget.prototype.onNodeRemoved = function(evt, node)
{
	//check if we are using one script in a tab
	if(!node)
		return;

	var components = node.getComponents();
	for(var i = 0; i < components.length; ++i)
	{
		var compo = components[i];
		//in case is open...
		if(compo.uid == this.current_code_info.id) //FIX
			this.editInstanceCode(null);
	}
}

CodingPadWidget.prototype.onScriptRenamed = function( e, instance )
{
	if(!instance)
		return;
}

CodingPadWidget.prototype.onCodeChanged = function( e, instance )
{
	//check to see if we have that instance
	if(!instance)
		return;
	var id = instance.uid;
	if(!id)
		return;
	var current = this.current_code_info;
	if(current.instance == instance)
	{
		//todo
	}
}

CodingPadWidget.prototype.onComponentRemoved = function( evt, compo )
{
	//TODO
}

CodingPadWidget.prototype.onPreparePlay = function()
{
	//test that all codes are valid

}

CodingPadWidget.prototype.onShowHelp = function()
{
	var info = this.getCurrentCodeInfo();
	if(!info || !info.options || !info.options.help)
		return;

	var help = info.options.help;

	var options = {
		content: "<pre style='padding:10px; height: 200px; overflow: auto'>" + help + "</pre>",
		title: "Help",
		draggable: true,
		closable: true,
		width: 400,
		height: 260
	};

	var dialog = new LiteGUI.Dialog("info_message",options);
	dialog.addButton("Close",{ close: true });
	dialog.show();
}

CodingPadWidget.prototype.onScriptError = function(e, instance_err)
{
	var info = this.getCurrentCodeInfo();
	if(!info || info.instance != instance_err[0])
		return;
	this.showError(instance_err[1]);
}

CodingPadWidget.prototype.onGlobalError = function(e, err)
{
	console.error("Global error");
	console.trace();
	console.error(err);
	var stack = err.stack.split("\n");
	if(stack[1].indexOf("<anonymous>") == -1)
		return;

	//could be a error triggered by an async callback
	this.showError(err);
}

CodingPadWidget.prototype.showError = function(err)
{
	this.showInFooter("<span style='color: #F55'>Error: " + err.message + "</span>");
	var num = LScript.computeLineFromError(err);
	if(num >= 0)
		this.markLine(num);
}

CodingPadWidget.prototype.detachWindow = function()
{
	var that = this;
	var main_window = window;

	if(!this.external_window)
	{
		this.show3DWindow(false);
		this.external_window = LiteGUI.main_tabs.detachTab( this.name, null, function(){
			that.external_window = null;
		});
	}
	else
	{
		this.external_window.close();
	}
}

CodingPadWidget.prototype.onOpenCode = function()
{
	var that = this;
	var dialog = new LiteGUI.Dialog(null,{ title:"Select Code", draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector();

	/*
	widgets.addTitle("New Script");
	widgets.addNode("Node", LS.GlobalScene.root.name );
	widgets.addString("Name","unnamed");
	widgets.addButton(null,"Create", function(){
		//TODO
		dialog.close();
	});

	widgets.addTitle("Open Script");
	*/

	var selected = null;

	var codes = [];

	//scripts in the scene
	var script_components = LS.GlobalScene.findNodeComponents( LS.Components.Script );
	for(var i in script_components)
		codes.push({ name: script_components[i].name, component: script_components[i] });

	//resources
	for(var i in LS.ResourcesManager.resources)
	{
		var resource = LS.ResourcesManager.resources[i];
		if( resource && resource.constructor === LS.Resource && resource.data && resource.data.constructor === String)
			codes.push({ name: i, resource: resource });
	}

	widgets.addList(null, codes, { height: 200, callback: function(value){
		selected = value;
	}});

	widgets.addButton(null,"Open", function(){
		if(selected)
		{
			if( selected.component )
			{
				var component = selected.component;
				var node = component._root;
				that.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
			}
			else if( selected.resource )
			{
				var resource = selected.resource;
				that.editInstanceCode( resource, { id: selected.name, title: LS.RM.getFilename(selected.name) });
			}
		}
		dialog.close();
	});


	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show( null, this.root );
	
}

CodingPadWidget.prototype.createCodingWindow = function()
{
	var extra_window = LiteGUI.newWindow("Code",800,600);
	this.windows.push( extra_window );
}


//creates the area containing the buttons and the codemirror
CodingPadWidget.prototype.createCodingArea = function( container )
{
	container = container || this.root;

	if(typeof(CodeMirror) == "undefined")
	{
		console.warn("CodeMirror missing");
		return;
	}

	var that = this;

	var coding_area = this.coding_area = new LiteGUI.Area(null,{ className: "codearea", content_id:"", height: "100%"});
	container.appendChild( coding_area.root );

	//top bar
	var top_widgets = this.top_widgets = new LiteGUI.Inspector( null, { one_line: true });

	//check for parsing errors
	top_widgets.addButton(null,"Open",{ width: 60, callback: function(v) { 
		that.onOpenCode();
	}});

	//check for parsing errors
	this.compile_button = top_widgets.addButton(null,"Compile",{ callback: function(v) { 
		that.evalueCode();
		LS.GlobalScene.refresh();
	}});
	this.compile_button.title = "(Ctrl+Enter)";

	this.save_button = top_widgets.addButton(null,"Save",{ callback: function(v) { 
		that.saveCode();
		LS.GlobalScene.refresh();
	}});
	this.save_button.title = "(Ctrl+S)";

	/*
	top_widgets.addButton(null,"Breakpoint",{ callback: function(v) { 
		that.addBreakPoint();
	}});
	*/

	top_widgets.addButton(null,"?",{ width: 30, callback: function(v) { 
		that.onShowHelp();
	}});

	top_widgets.addButton(null,"-",{ width: 30, callback: function(v) { 
		that.changeFontSize(-1);
	}});
	top_widgets.addButton(null,"+",{ width: 30, callback: function(v) { 
		that.changeFontSize(+1);
	}});

	var coding_workarea_root = coding_area;

	var coding_workarea = this.workarea = new LiteGUI.Area("coding-workarea");
	coding_workarea.add( top_widgets );
	coding_workarea_root.add( coding_workarea );

	//TODO: this could be improved to use LiteGUI instead
	var code_container_element = LiteGUI.createElement("div",".code-container",null, { height: "calc(100% - 54px)", overflow: "overflow: auto" });
	var code_footer_element = LiteGUI.createElement("div",".code-footer",null, "height:18px; padding: 4px 0 0 4px; background-color: #222;");
	coding_workarea.content.appendChild( code_container_element );
	coding_workarea.content.appendChild( code_footer_element );

	//$(coding_workarea.content).append("<div class='code-container' style='height: calc(100% - 54px); height: -moz-calc(100% - 54px); height: -webkit-calc(100% - 54px); overflow: auto'></div><div class='code-footer' style='height:18px; padding: 4px 0 0 4px; background-color: #222;'></div>");
	var code_container = this.code_container = coding_workarea.query(".code-container");

	this.editor = CodeMirror( code_container, {
		value: "",
		mode:  "javascript",
		theme: "blackboard",
		lineWrapping: this.wrap_lines,
		gutter: true,
		tabSize: 2,
		lineNumbers: true,
		matchBrackets: true,
		styleActiveLine: true,
		extraKeys: {
			"Ctrl-Enter": "compile",
			"Ctrl-S": "save",
			"Ctrl-Space": "autocomplete",
			"Cmd-Space": "autocomplete",
			//"Ctrl-F": "insert_function",
			"Cmd-F": "insert_function",
			"Ctrl-P": "playstop_scene",
			},
		onCursorActivity: function(e) {
			that.editor.matchHighlight("CodeMirror-matchhighlight");
		}
	  });

	 this.editor.coding_area = this;
	 this.editor.on("change", that.onCodeChange.bind( this ) );
}


function getCompletions( token, context ) {
  var found = [], start = token.string;
  function maybeAdd(str) {
    if (str.indexOf(start) == 0) found.push(str);
  }
  function gatherCompletions(obj) {
    if (typeof obj == "string") forEach(stringProps, maybeAdd);
    else if (obj instanceof Array) forEach(arrayProps, maybeAdd);
    else if (obj instanceof Function) forEach(funcProps, maybeAdd);
    for (var name in obj) maybeAdd(name);
  }

  if (context) {
    // If this is a property, see if it belongs to some object we can
    // find in the current environment.
    var obj = context.pop(), base;
    if (obj.className == "js-variable")
      base = window[obj.string];
    else if (obj.className == "js-string")
      base = "";
    else if (obj.className == "js-atom")
      base = 1;
    while (base != null && context.length)
      base = base[context.pop().string];
    if (base != null) gatherCompletions(base);
  }
  else {
    // If not, just look in the window object and any local scope
    // (reading into JS mode internals to get at the local variables)
    for (var v = token.state.localVars; v; v = v.next) maybeAdd(v.name);
    gatherCompletions(window);
    forEach(keywords, maybeAdd);
  }
  return found;
}



/* CODEMIRROR STUFF *******************************************************/
CodingPadWidget.codemirror_scripts = ["js/extra/codemirror/codemirror.js",
								"js/extra/codemirror/hint/show-hint.js",
								"js/extra/codemirror/hint/javascript-hint.js",
								"js/extra/codemirror/selection/active-line.js",
								"js/extra/codemirror/javascript.js"];
CodingPadWidget.codemirror_css = ["js/extra/codemirror/codemirror.css",
							"js/extra/codemirror/blackboard.css",
							"js/extra/codemirror/hint/show-hint.css"];

CodingPadWidget.loadCodeMirror = function()
{
	//load codemirror
	if(typeof(CodeMirror) === "undefined")
	{
		console.log("Loading CodeMirror...");
		LiteGUI.requireScript( CodingPadWidget.codemirror_scripts,
								function() {
									console.log("CodeMirror loaded");
									CodingPadWidget.prepareCodeMirror();
								});
		LiteGUI.requireCSS( CodingPadWidget.codemirror_css );
		LiteGUI.addCSS(".error-line { background-color: #511; }\n\
						.CodeMirror div.CodeMirror-cursor, .CodeMirror pre { z-index: 0 !important; }\n\
						.CodeMirror-selected { background-color: rgba(100,100,100,0.5) !important; outline: 1px dashed rgba(255,255,255,0.8); }\n\
					   ");
	}
	else
		console.log("CodeMirror found");
}

CodingPadWidget.prepareCodeMirror = function()
{
	CodeMirror.commands.autocomplete = function( cm ) {
		var pad = cm.coding_area;
		var info = pad.current_code_info;
		if(!info)
			return;

		var lang = "javascript";
		if(info.options && info.options.lang)
			lang = info.options.lang;

		if(lang != "javascript")
			CodeMirror.showHint( cm, CodeMirror.hintAPI );
		else
		{
			window.component = info.instance;
			if(window.component)
				window.node = window.component._root;
			window.scene = LS.GlobalScene;

			CodeMirror.showHint( cm, CodeMirror.javascriptHint );
		}
	}

	CodeMirror.hintAPI = function( cm, options)
	{
		var Pos = CodeMirror.Pos;
		function getToken(e, cur) {return e.getTokenAt(cur);}

		var pad = cm.coding_area;
		var info = pad.current_code_info;
		if(!info || !info.options || !info.options.lang )
			return;

		var API = CodingModule.APIs[ info.options.lang ];
		if(!API)
			return;

		var cur = cm.getCursor(), token = getToken(cm, cur), tprop = token;
		var found = [], start = token.string;

		if(start == ".")
		{
			for(var i in API)
				if( i.indexOf( start ) != -1)
					found.push( i );
		}
		else
		{
			for(var i in API)
				if( i.indexOf( start ) == 0)
					found.push( i );
		}

		return {
			from: Pos(cur.line, token.start),
			to: Pos(cur.line, token.end),
			list: found 
		};
	}

	CodeMirror.commands.playstop_scene = function(cm) {
		if(window.PlayModule)
			PlayModule.onPlay();
	}		

	CodeMirror.commands.save = function(cm) {
		var pad = cm.coding_area;
		pad.saveCode();
		LS.GlobalScene.refresh();
	}

	CodeMirror.commands.compile = function(cm) {
		var pad = cm.coding_area;
		pad.evalueCode();
		LS.GlobalScene.refresh();
	}
}

CodingPadWidget.loadCodeMirror();
/****************************************************************************/

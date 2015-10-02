EVAL = function(code) { return new Function(code); } //done to have line number, do not move

function CodingWidget()
{
	this.root = null;
	this.autocompile = false; //assign code to component on every keystroke
	this.wrap_lines = false;
	this.editor = null;
	this.init();
}



CodingWidget.codemirror_scripts = ["js/extra/codemirror/codemirror.js",
								"js/extra/codemirror/hint/show-hint.js",
								"js/extra/codemirror/hint/javascript-hint.js",
								"js/extra/codemirror/selection/active-line.js",
								"js/extra/codemirror/javascript.js"];
CodingWidget.codemirror_css = ["js/extra/codemirror/codemirror.css",
							"js/extra/codemirror/blackboard.css",
							"js/extra/codemirror/hint/show-hint.css"];

CodingWidget.prototype.init = function()
{
	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });
	
	//tabs for every file
	var files_tabs = new LiteGUI.Tabs("codefiletabs", {});
	this.root.add( files_tabs );
	this.plus_tab = files_tabs.addTab( "plus_tab", { title: "+", tab_width: 20, button: true, callback: this.onPlusTab.bind(this), skip_callbacks: true });
	files_tabs.root.style.marginTop = "4px";
	files_tabs.root.style.backgroundColor = "#111";
	//files_tabs.addTab("+", { });
	this.files_tabs = files_tabs;


	//load codemirror
	if(typeof(CodeMirror) === undefined)
	{
		var that = this;
		LiteGUI.requireScript( CodingWidget.codemirror_scripts,
								function() {
									that.prepareCodeMirror();
									that.createCodingArea(); 
								});
		LiteGUI.requireCSS( CodingWidget.codemirror_css );
		LiteGUI.addCSS(".error-line { background-color: #511; }\n\
						.CodeMirror div.CodeMirror-cursor, .CodeMirror pre { z-index: 0 !important; }\n\
						.CodeMirror-selected { background-color: rgba(100,100,100,0.5) !important; outline: 1px dashed rgba(255,255,255,0.8); }\n\
					   ");
	}
	else
		this.createCodingArea(); 

	this.bindEvents();
}

CodingWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title:"Coding", fullcontent: true, closable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
	var coding_widget = new CodingWidget();
	dialog.add( coding_widget );
	dialog.coding_area = coding_widget;
	dialog.on_close = function()
	{
		coding_widget.unbindEvents();		
	}
	return dialog;
}

CodingWidget.prototype.bindEvents = function()
{
	LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload, this );
	LEvent.bind( LS.GlobalScene, "reload", this.onReload, this );
	LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved, this );
	LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved, this );
	LEvent.bind( LS.Components.Script, "code_error", this.onScriptError, this );
	LEvent.bind( LS.Components.Script, "renamed", this.onScriptRenamed, this );
	LEvent.bind( CodingWidget, "code_changed", this.onCodeChanged, this);

	LEvent.bind( LS, "code_error", this.onGlobalError, this );
}

CodingWidget.prototype.unbindEvents = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS.Components.Script, this );
	LEvent.unbindAll( LS, this );
}

//switch coding tab
CodingWidget.prototype.editInstanceCode = function( instance, options )
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

	//changing from one tab to another? save state of old tab
	if( current_code_info )
	{
		this.assignCurrentCode(true); //save the current state of the codemirror inside the instance (otherwise changes would be lost)
		//get cursor pos (line and char)
		//store in current_tab
	}

	//compute id
	var id = options.id || instance.uid || instance.id;
	var title = options.title || instance.name || id;

	//check if the tab already exists
	var tab = this.files_tabs.getTab( id );
	if(tab)
	{
		this.files_tabs.selectTab( id ); //this calls onTabClicked
	}
	else //doesnt exist? then create a tab for this code
	{
		var num = this.files_tabs.getNumOfTabs();
		tab = this.files_tabs.addTab( id, { title: title, instance: instance, selected: true, closable: true, callback: onTabClicked, onclose: onTabClosed, skip_callbacks: true, index: num - 1});
		tab.code_info = { id: id, instance: instance, options: options };
	}

	//update coding context
	this.current_code_info = tab.code_info;
	var code = null;
	if(this.current_code_info.options.getCode)
		code = this.current_code_info.options.getCode();
	else
		code = instance.getCode();
	if(!code)
		code = "";
	this.editor.setValue( code );
	this.editor.refresh();
	if(tab.code_info && tab.code_info.pos)
		this.editor.setCursor( tab.code_info.pos );

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

	//callbacks ******************************
	var that = this;

	function onTabClicked()
	{
		that.editInstanceCode( instance, options ); 
	}

	function onTabClosed(tab)
	{
		if( tab.selected )
			that.editInstanceCode( null );
	}
}

CodingWidget.prototype.closeInstanceTab = function( instance, options )
{
	options = options || {};

	var id = options.id || instance.uid || instance.id;
	var title = options.title || id;

	//check if the tab already exists
	var tab = this.files_tabs.getTab( id );
	if(!tab)
		return false;

	var info = tab.code_info;
	this.files_tabs.removeTab( id );

	//open next tab or clear the codemirror editor content
	if(this.current_code_info == info )
	{
		this.current_code_info = null;
		this.editor.setValue("");
	}

	return true;
}

CodingWidget.prototype.onCodeChange = function( editor )
{
	if(this.autocompile)
		this.assignCurrentCode();
}

//puts the codemirror code inside the instance (component) and triggers event (which will evaluate it)
CodingWidget.prototype.assignCurrentCode = function( skip_events )
{
	var info = this.getCurrentCodeInfo();
	if(!info)
		return;

	var instance = info.instance;
	var code = this.editor.getValue();
	info.pos = this.editor.getCursor();

	var old_code = null;
	if(info.options.getCode)
		old_code = info.options.getCode();
	else
		old_code = instance.getCode();

	if(code == old_code)
		return;

	if(info.options.setCode)
		info.options.setCode( code );
	else
		instance.code = code;

	if(skip_events) 
		return true; 

	LEvent.trigger( instance, "code_changed", code );
	if( instance.onCodeChange )
		return instance.onCodeChange( code );
	LEvent.trigger( CodingArea, "code_changed", info );
	return true;
}

CodingWidget.prototype.showInFooter = function(msg) {
	this.workarea.query("#code-footer").innerHTML = msg;
}

CodingWidget.prototype.getCurrentCodeInfo = function()
{
	return this.current_code_info;
}

CodingWidget.prototype.evalueCode = function()
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

CodingWidget.prototype.addBreakPoint = function()
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

CodingWidget.prototype.changeFontSize = function(num)
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
CodingWidget.prototype.markLine = function(num)
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
CodingWidget.prototype.onBeforeReload = function(e)
{
	var state = { tabs: [] };

	//for every tab open
	for(var i in this.files_tabs.tabs)
	{
		var tab = this.files_tabs.tabs[i];
		if(!tab.id)
			continue;
		//get the uid of the component and the cursor info
		var info = tab.code_info;
		state.tabs.push( info );
	}
	this._saved_state = state;
}

	//reload all the codes open
CodingWidget.prototype.onReload = function(e)
{
	if(!this._saved_state)
		return;

	var state = this._saved_state;
	this.files_tabs.removeAllTabs();

	for(var i in state.tabs)
	{
		var tab = state.tabs[i];
		if(!tab || !tab.id)
			continue;
		var instance = LS.GlobalScene.findComponentByUId( tab.id );
		this.editInstanceCode( instance, tab.options );
	}

	this._saved_state = null;
}

CodingWidget.prototype.onNodeRemoved = function(evt, node)
{
	//check if we are using one script in a tab
	if(!node)
		return;

	var components = node.getComponents();
	for(var i = 0; i < components.length; ++i)
	{
		var compo = components[i];
		//in case is open...
		this.closeInstanceTab( compo );
	}
}

CodingWidget.prototype.onScriptRenamed = function( e, instance )
{
	if(!instance)
		return;

	var id = instance.uid;
	if(!id)
		return;
	var tab = this.files_tabs.getTab( id );
	if(!tab)
		return;
	var title = tab.tab.querySelector(".tabtitle");
	if(title && instance.name)
		title.innerHTML = instance.name;
}

CodingWidget.prototype.onCodeChanged = function( e, instance )
{
	//check to see if we have that instance
	if(!instance)
		return;
	var id = instance.uid;
	if(!id)
		return;
	var tab = this.files_tabs.getTab( id );
	if(!tab)
		return;
	var current = this.current_code_info;

	if(current.instance == instance)
	{
		//todo
	}
}

CodingWidget.prototype.onComponentRemoved = function(evt, compo )
{
	this.closeInstanceTab( compo );
}

CodingWidget.prototype.onPreparePlay = function()
{
	//test that all codes are valid

}

CodingWidget.prototype.onShowHelp = function()
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

CodingWidget.prototype.onPlusTab = function(tab_id, e)
{
	var that = this;

	var options = ["Create"];

	var scripts = LS.GlobalScene.findNodeComponents( LS.Components.Script );
	if( scripts.length )
		options.push("Open");

	var menu = new LiteGUI.ContextualMenu( options, { event: e, callback: function(value, options) {
		if(value == "Create")
			that.onNewScript();
		else if(value == "Open")
		{
			var script_names = [];
			for(var i in scripts)
				script_names.push({ title: scripts[i].name, component: scripts[i] });

			var submenu = new LiteGUI.ContextualMenu( script_names, { event: options.event, callback: function(value) {
				var component = value.component;
				var node = component._root;
				that.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
			}});
		}
	}});
}

CodingWidget.prototype.onNewScript = function( node )
{
	var component = new LS.Components.Script();
	node = node || SelectionModule.getSelectedNode();
	if(!node)
		node = LS.GlobalScene.root;
	node.addComponent( component );
	this.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
	EditorModule.refreshAttributes();
}

//search for all the components that have a getCode function and inserts them
CodingWidget.prototype.onOpenAllScripts =function()
{
	var nodes = LS.GlobalScene.getNodes();
	for(var i in nodes)
	{
		var node = nodes[i];
		var comps = node.getComponents();
		for(var j in comps)
		{
			var component = comps[j];
			if(!component.getCode)
				continue;
			if(this.files_tabs.getTab( component.uid ))
				continue;

			var code = component.getCode();
			this.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
		}
	}
}

CodingWidget.prototype.onScriptError = function(e, instance_err)
{
	console.trace("Script crashed");
	var code_info = this.getCurrentCodeInfo();
	if( code_info.instance != instance_err[0] )
		return;
	this.showError(instance_err[1]);
}

CodingWidget.prototype.onGlobalError = function(e, err)
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

CodingWidget.prototype.showError = function(err)
{
	//LiteGUI.alert("Error in script\n" + err);
	console.log("Coding ", err );
	this.showInFooter("<span style='color: #F55'>Error: " + err.message + "</span>");
	var num = this.computeLineFromError(err);
	if(num >= 0)
		this.markLine(num);
}

CodingWidget.prototype.computeLineFromError = function(err)
{
	if(err.lineNumber !== undefined)
	{
		return err.lineNumber;
	}
	else if(err.stack)
	{
		var lines = err.stack.split("\n");
		var line = lines[1].trim();
		var tokens = line.split(" ");
		var pos = line.lastIndexOf(":");
		var pos2 = line.lastIndexOf(":",pos-1);
		var num = parseInt( line.substr(pos2+1,pos-pos2-1) );
		var ch = parseInt( line.substr(pos+1, line.length - 2 - pos) );
		if(tokens[1] == "Object.CodingModule.eval")
			return -1;
		if (line.indexOf("LScript") != -1 || line.indexOf("<anonymous>") != -1 )
			num -= 3; //ignore the header lines of the LScript class
		return num;
	}
	return -1;
}

CodingWidget.prototype.detachWindow = function()
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

CodingWidget.prototype.createCodingWindow = function()
{
	var extra_window = LiteGUI.newWindow("Code",800,600);
	this.windows.push( extra_window );
}


//creates the area containing the buttons and the codemirror
CodingWidget.prototype.createCodingArea = function( container )
{
	container = container || this.root;

	var that = this;

	var coding_area = this.coding_area = new LiteGUI.Area("codearea",{content_id:"", height: -30});
	container.appendChild( coding_area.root );

	//top bar
	var top_widgets = this.top_widgets = new LiteGUI.Inspector("coding-top-widgets", { one_line: true });

	//check for parsing errors
	top_widgets.addButton(null,"Compile",{ callback: function(v) { 
		//console.log(CodingModule.area);
		that.evalueCode();
		LS.GlobalScene.refresh();
	}}).title = "(Ctrl+Enter)";

	top_widgets.addButton(null,"Breakpoint",{ callback: function(v) { 
		//console.log(CodingModule.area);
		that.addBreakPoint();
	}});

	top_widgets.addButton(null,"Open All",{ callback: function(v) { 
		that.onOpenAllScripts();
	}});

	top_widgets.addButton(null,"Help",{ callback: function(v) { 
		that.onShowHelp();
	}});

	//this.top_widget.addSeparator();

	/*
	top_widgets.addButton(null,"Detach",{ width: 80, callback: function(v) { 
		//console.log(CodingModule.area);
		setTimeout( function() { CodingModule.detachWindow(); },500 );
	}});
	*/

	/*
	top_widget.addButton(null,"New",{ width: 50, callback: function(v) { 
		CodingModule.createCodingWindow();
	}});
	*/

	top_widgets.addButton(null,"-",{ width: 40, callback: function(v) { 
		that.changeFontSize(-1);
	}});
	top_widgets.addButton(null,"+",{ width: 40, callback: function(v) { 
		that.changeFontSize(+1);
	}});

	/*
	top_widgets.addButton(null,"3D",{ width: 40, callback: function(v) { 
		that.show3DWindow( !CodingModule.sceneview_visible );
	}});
	*/

	//this.top_widgets.addButton(null,"Execute", { callback: null });

	var coding_workarea_root = coding_area;

	var coding_workarea = this.workarea = new LiteGUI.Area("coding-workarea");
	coding_workarea.add( top_widgets );
	coding_workarea_root.add( coding_workarea );

	//TODO: this could be improved to use LiteGUI instead
	$(coding_workarea.content).append("<div class='code-container' style='height: calc(100% - 54px); height: -moz-calc(100% - 54px); height: -webkit-calc(100% - 54px); overflow: auto'></div><div id='code-footer' style='height:18px; padding: 4px 0 0 4px; background-color: #222;'></div>");
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

CodingWidget.prototype.prepareCodeMirror = function()
{
	//CODING AREA *********************************
	CodeMirror.commands.autocomplete = function(cm) {
		var API = CodingModule._current_API;
		if(!API)
			CodeMirror.showHint(editor, CodeMirror.javascriptHint);
		else
			CodeMirror.showHint(cm, CodeMirror.hintAPI );
	}

	CodeMirror.hintAPI = function(editor, options)
	{
		var Pos = CodeMirror.Pos;
		function getToken(e, cur) {return e.getTokenAt(cur);}

		var API = CodingModule._current_API;

		var cur = editor.getCursor(), token = getToken(editor, cur), tprop = token;
		var found = [], start = token.string;

		for(var i in API)
			if( i.indexOf( start ) == 0)
				found.push( i );

		return {
			from: Pos(cur.line, token.start),
			to: Pos(cur.line, token.end),
			list: found 
		};
	}

	/*
	CodeMirror.commands.insert_function = function(cm) {
		//trace(cm);
		cm.replaceRange("function() {}",cm.getCursor(),cm.getCursor());
		var newpos = cm.getCursor();
		newpos.ch -= 1; //set cursor inside
		cm.setCursor(newpos);
	}
	*/

	CodeMirror.commands.playstop_scene = function(cm) {
		if(window.PlayModule)
			PlayModule.onPlay();
	}		

	CodeMirror.commands.compile = function(cm) {
		CodingModule.evalueCode();
		Scene.refresh();
	}
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

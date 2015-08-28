var CodingModule = //do not change
{
	name: "Code",
	bigicon: "imgs/tabicon-code.png",

	eval: function(code) { return new Function(code); }, //done to have line number, do not move

	autocompile: false, //assign code to component on every keystroke

	default_sceneview: true,
	wrap_lines: false,
	sceneview_visible: true, //side panel

	global_context: null, //used to store coding context info (the codemirror, etc)
	context: {},
	editor: null, //codemirror editor instance
	APIs: {}, //here you can register function calls of the API

	windows: [], //external windows

	codemirror_scripts: ["js/extra/codemirror/codemirror.js",
								"js/extra/codemirror/hint/show-hint.js",
								"js/extra/codemirror/hint/javascript-hint.js",
								"js/extra/codemirror/selection/active-line.js",
								"js/extra/codemirror/javascript.js"],
	codemirror_css: ["js/extra/codemirror/codemirror.css",
							"js/extra/codemirror/blackboard.css",
							"js/extra/codemirror/hint/show-hint.css"],

	init: function()
	{
		if(!gl)
			return;

		this.tab = LiteGUI.main_tabs.addTab( this.name, {
			id:"codingtab",
			bigicon: this.bigicon,
			size: "full", 
			callback: function(tab) {

				if(CodingModule.editor)
					CodingModule.editor.refresh();
				
				if(!CodingModule.external_window)
					CodingModule.show3DWindow( CodingModule.default_sceneview );

				InterfaceModule.setSidePanelVisibility(false);
				CodingModule.setCodingVisibility(true);
			},
			callback_canopen: function(){
				//avoid opening the tab if it is in another window
				if(CodingModule.external_window)
					return false;
			},
			callback_leave: function() {
				RenderModule.appendViewportTo(null);
				CodingModule.assignCurrentCode();
		}});

		this.root = LiteGUI.main_tabs.getTab(this.name).content;

		//tabs for every file
		var files_tabs = new LiteGUI.Tabs("codefiletabs", {});
		this.root.appendChild( files_tabs.root );
		files_tabs.root.style.marginTop = "4px";
		files_tabs.root.style.backgroundColor = "#111";
		//files_tabs.addTab("+", { });
		this.files_tabs = files_tabs;

		//coding area is created after loading CodeMirror

		//include codemirror
		LiteGUI.requireScript( this.codemirror_scripts,
								function() { 
									CodingModule.onCodeMirrorLoaded(); 
								});
		LiteGUI.requireCSS( this.codemirror_css );
		LiteGUI.addCSS(".error-line { background-color: #511; }\n\
						.CodeMirror div.CodeMirror-cursor, .CodeMirror pre { z-index: 0 !important; }\n\
						.CodeMirror-selected { background-color: rgba(100,100,100,0.5) !important; outline: 1px dashed rgba(255,255,255,0.8); }\n\
					   ");

		//bind events used save stuff
		LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload.bind(this) );
		LEvent.bind( LS.GlobalScene, "reload", this.onReload.bind(this) );
		LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved.bind(this) );
		LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved.bind(this) );
		

		//register some APIs used for autocompletion
		this.registerAPI("glsl", ["texture2D","sampler2D","uniform","varying","radians","degrees","sin","cos","tan","asin","acos","atan","pow","exp","log","exp2"] );
		this.registerAPI("glsl", ["IN.color","IN.vertex","IN.normal","IN.uv","IN.uv1","IN.camPos","IN.viewDir","IN.worldPos","IN.worldNormal","IN.screenPos"] );
		this.registerAPI("glsl", ["OUT.Albedo","OUT.Normal","OUT.Emission","OUT.Specular","OUT.Gloss","OUT.Alpha","OUT.Reflectivity"] );

		LEvent.bind( LS.Components.Script, "code_error", this.onScriptError.bind(this) );
		LEvent.bind( LS, "code_error", this.onGlobalError.bind(this) );

		LiteGUI.menubar.add("Actions/Catch Errors", { type: "checkbox", instance: LS, property: "catch_errors" });

		//LEvent.bind(Scene,"start", this.onStart.bind(this));
		//LEvent.bind(Scene,"update", this.onUpdate.bind(this));
	},

	//registers a coding API (help, links to wiki, autocompletion, etc)
	registerAPI: function( lang, funcs )
	{
		var API = this.APIs[lang];
		if( !this.APIs[lang] )
			API = this.APIs[lang] = {};

		for(var i in funcs)
			API[ funcs[i] ] = true;
	},

	//open coding tab
	openTab: function()
	{
		LiteGUI.main_tabs.selectTab( this.name );
		var info = this.getCurrentCodeInfo();
		if(!info)
			this.global_context.editor.setValue("");
		else if( info.show_3d_view !== undefined )
			this.show3DWindow( info.show_3d_view );

		this.showInFooter("");
		CodingModule.setCodingVisibility(true);
	},

	//close coding tab ( back to scene view )
	closeTab: function()
	{
		LiteGUI.main_tabs.selectTab( RenderModule.name );
	},

	//call to say which instance do you want to edit
	//instance must have a function called getCode
	/*
	editInstanceCode: function(instance, options )
	{
		//if instance is null then deselect this one (deprecated?)
		if(!instance)
		{
			this._edited_instance = null;
			this._code_options = null;
			this._code_lang = null;
			this._current_API = null;
			window.node = null;
			this.global_context.editor.setValue("");
			return;
			this.updateCodingVisibility();
			this.global_context.editor.refresh();
		}

		options = options || {};
		var lang = options.lang || "javascript";

		//check for existing tab with this instance
		if(options.id)
		{
			//create tab
			if(!this.files_tabs.getTab(options.id))
				this.files_tabs.addTab(options.id, { title: options.title, instance: instance, selected: true, closable: true, callback: function(){ 
					//save current
					CodingModule.assignCurrentCode(true); //save the current state of the codemirror inside the instance (otherwise changes would be lost)
					CodingModule.editInstanceCode(instance, options); 
				},
				onclose: function(tab){
					if(tab.selected)
						CodingModule.editInstanceCode(null); 
				}});
		}

		//save current state

		this._edited_instance = instance;
		this._code_options = options;
		this._code_lang = lang;
		this._current_API = this.APIs[ options.lang ];
		window.node = instance._root;
		var code = instance.getCode();
		this.global_context.editor.setValue( code );
		this.updateCodingVisibility();
		this.global_context.editor.refresh();

		if(this.external_window)
			this.external_window.focus();
	},
	*/
	
	//switch coding tab
	editInstanceCode: function( instance, options )
	{
		options = options || {};
		var lang = options.lang || "javascript";

		//used when a tab is closed
		if(!instance)
			return;

		var current_code_info = this.current_code_info;

		//check if we are editing the current one
		if(current_code_info && current_code_info.instance == instance)
			return;

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
			tab = this.files_tabs.addTab( id, { title: title, instance: instance, selected: true, closable: true, callback: onTabClicked, onclose: onTabClosed, skip_callbacks: true });
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
		this.setCodingVisibility(true);

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
		function onTabClicked()
		{
			CodingModule.editInstanceCode( instance, options ); 
		}

		function onTabClosed(tab)
		{
			if(tab.selected)
				CodingModule.editInstanceCode(null); 
		}
	},

	closeInstanceTab: function( instance, options )
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
	},

	onCodeChange: function(editor)
	{
		if(this.autocompile)
			this.assignCurrentCode();
	},

	//puts the codemirror code inside the instance (component) and triggers event (which will evaluate it)
	assignCurrentCode: function( skip_events )
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
		return true;
	},

	//wait codemirror to load before creating anything or there will be problems
	onCodeMirrorLoaded: function()
	{
		this.global_context = this.createCodingArea( this.root );
		this.editor = this.global_context.editor;
		this.coding_area = this.global_context.area;
	},

	showInFooter: function(msg) {
		this.global_context.workarea.query("#code-footer").innerHTML = msg;
	},

	getCurrentCodeInfo: function()
	{
		return this.current_code_info;

		var current_tab = this.files_tabs.getCurrentTab();
		if(current_tab && current_tab.code_info)
			return current_tab.code_info;
		return null;
	},

	evalueCode: function()
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
		var code = this.global_context.editor.getValue();

		try
		{
			this.last_executed_code = code;
			code = LScript.expandCode( code ); //multiline strings and other helpers
			this.eval(code); //this eval is in a line easier to control

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
	},

	addBreakPoint: function()
	{
		var info = this.getCurrentCodeInfo();
		if(!info)
			return;

		if(info.lang && info.lang != "javascript")
			return;

		var pos = this.global_context.editor.getCursor();
		pos.ch = 0;
		this.global_context.editor.replaceRange("{{debugger}}", pos, pos) 
	},

	changeFontSize: function(num)
	{
		var code_container = this.global_context.code_container;
		var root = code_container.querySelector(".CodeMirror");
		var size = root.style.fontSize;
		if(!size)
			size = 14;
		else
			size = parseInt(size);
		size += num;
		root.style.fontSize = size + "px";
	},

	last_error_line: null,
	markLine: function(num)
	{
		var cm = this.global_context.editor;

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
	},	

	//save the state 
	onBeforeReload: function(e)
	{
		var state = { tabs: [] };

		//for every tab open
		for(var i in this.files_tabs.tabs)
		{
			var tab = this.files_tabs.tabs[i];

			//get the uid of the component and the cursor info
			var info = tab.code_info;
			state.tabs.push( info );
		}
		this._saved_state = state;
	},

	//reload all the codes open
	onReload: function(e)
	{
		if(!this._saved_state)
			return;

		var state = this._saved_state;
		this.files_tabs.removeAllTabs();

		for(var i in state.tabs)
		{
			var tab = state.tabs[i];
			var instance = LS.GlobalScene.findComponentByUId( tab.id );
			this.editInstanceCode( instance, tab.options );
		}

		this._saved_state = null;
	},

	onNodeRemoved: function(evt, node)
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
	},

	onScriptRenamed: function( instance )
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
	},

	onComponentRemoved: function(evt, compo )
	{
		this.closeInstanceTab( compo );
	},

	onShowHelp: function()
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
	},

	onNewScript: function( node )
	{
		var component = new LS.Components.Script();
		node = node || SelectionModule.getSelectedNode();
		if(!node)
			node = Scene.root;
		node.addComponent( component );
		this.openTab();
		this.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
	},

	onOpenAllScripts: function()
	{
		var nodes = Scene.getNodes();
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
	},

	onScriptError: function(e, instance_err)
	{
		console.trace("Script crashed");
		var code_info = this.getCurrentCodeInfo();
		if( code_info.instance != instance_err[0] )
			return;
		this.showError(instance_err[1]);
	},

	onGlobalError: function(e, err)
	{
		console.error("Global error");
		console.trace();
		console.error(err);
		var stack = err.stack.split("\n");
		if(stack[1].indexOf("<anonymous>") == -1)
			return;

		//could be a error triggered by an async callback
		this.showError(err);
	},

	showError: function(err)
	{
		//LiteGUI.alert("Error in script\n" + err);
		console.log("Coding ", err );
		this.showInFooter("<span style='color: #F55'>Error: " + err.message + "</span>");
		var num = this.computeLineFromError(err);
		if(num >= 0)
			this.markLine(num);
	},

	computeLineFromError: function(err)
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
	},

	detachWindow: function()
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
	},

	createCodingWindow: function()
	{
		var extra_window = LiteGUI.newWindow("Code",800,600);
		this.windows.push( extra_window );
	},

	//shows the side 3d window
	show3DWindow: function(v)
	{
		this.sceneview_visible = v;
		var info = this.getCurrentCodeInfo();
		if(info)
			info.show_3d_view = !!v;

		if(v)
		{
			RenderModule.appendViewportTo( this.coding_area.sections[1].content );
			this.coding_area.showSection(1);
		}
		else
		{
			RenderModule.appendViewportTo(null);
			this.coding_area.hideSection(1);
		}
	},

	setCodingVisibility: function(v)
	{
		var coding_area = this.global_context.code_container;
		if(!coding_area) 
			return;
		coding_area.style.display = v ? "block" : "none";
	},

	onUnload: function()
	{
		if(this.external_window)
			this.external_window.close();
	},

	//creates the area containing the buttons and the codemirror
	createCodingArea: function( container )
	{
		var context = {
			root: container
		};

		var coding_area = new LiteGUI.Area("codearea",{content_id:"", height: -30});
		container.appendChild( coding_area.root );
		coding_area.split("horizontal",["50%","calc(50% - 5px)"],true);

		context.area = coding_area;

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

		//top bar
		var top_widget = context.top_widget = new LiteGUI.Inspector("coding-top-widgets", { one_line: true });
		/*this.top_widget.addButton(null,"Create", { callback: null });*/
		//this.top_widget.addButton(null,"Evaluate", { callback: function() { CodingModule.evalueCode(); }});

		//check for parsing errors
		top_widget.addButton(null,"Compile",{ callback: function(v) { 
			//console.log(CodingModule.area);
			CodingModule.evalueCode();
			Scene.refresh();
		}}).title = "(Ctrl+Enter)";

		top_widget.addButton(null,"Breakpoint",{ callback: function(v) { 
			//console.log(CodingModule.area);
			CodingModule.addBreakPoint();
		}});

		top_widget.addButton(null,"New Script",{ callback: function(v) { 
			CodingModule.onNewScript();
		}});

		top_widget.addButton(null,"Open All",{ callback: function(v) { 
			CodingModule.onOpenAllScripts();
		}});

		top_widget.addButton(null,"Help",{ callback: function(v) { 
			CodingModule.onShowHelp();
		}});

		//this.top_widget.addSeparator();

		top_widget.addButton(null,"Detach",{ width: 80, callback: function(v) { 
			//console.log(CodingModule.area);
			setTimeout( function() { CodingModule.detachWindow(); },500 );
		}});

		/*
		top_widget.addButton(null,"New",{ width: 50, callback: function(v) { 
			CodingModule.createCodingWindow();
		}});
		*/

		top_widget.addButton(null,"-",{ width: 40, callback: function(v) { 
			CodingModule.changeFontSize(-1);
		}});
		top_widget.addButton(null,"+",{ width: 40, callback: function(v) { 
			CodingModule.changeFontSize(+1);
		}});

		top_widget.addButton(null,"3D",{ width: 40, callback: function(v) { 
			CodingModule.show3DWindow(!CodingModule.sceneview_visible);
		}});

		/*
		this.top_widget.addString("Search","",{ callback: function(v) { 
			//TODO
		}});
		*/
		//this.top_widget.addButton(null,"Close Editor", { callback: function() { CodingModule.closeTab(); }});
		//this.top_widget.addButton(null,"Execute", { callback: null });

		var coding_workarea_root = coding_area.sections[0];

		var coding_workarea = context.workarea = new LiteGUI.Area("coding-workarea");
		coding_workarea.add( top_widget );
		coding_workarea_root.add( coding_workarea );

		//TODO: this could be improved to use LiteGUI instead
		$(coding_workarea.content).append("<div class='code-container' style='height: calc(100% - 54px); height: -moz-calc(100% - 54px); height: -webkit-calc(100% - 54px); overflow: auto'></div><div id='code-footer' style='height:18px; padding: 4px 0 0 4px; background-color: #222;'></div>");
		var code_container = context.code_container = coding_workarea.query(".code-container");

		var editor = CodeMirror(code_container, {
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
				CodingModule.editor.matchHighlight("CodeMirror-matchhighlight");
			}
		  });

		  editor.on("change", CodingModule.onCodeChange.bind(CodingModule) );

		 context.editor = editor;
		 return context;
	}
};

LiteGUI.registerModule( CodingModule );



function getCompletions(token, context) {
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

/*
LiteWidgets.prototype.addScript = function(name,value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[name] = value;

	var element = this.createWidget(null,"<p>"+name+"</p><span class='inputfield textarea disabled'><textarea tabIndex='"+this.tab_index+"' "+(options.disabled?"disabled":"")+">"+value+"</textarea></span><p><button>Edit Code</button></p>", options);
	this.tab_index++;

	$(element).find(".wcontent textarea").bind( options.inmediate ? "keyup" : "change", function(e) { 
		LiteWidgets.onWidgetChange.call(that,element,name,e.target.value, options);
	});

	$(element).find("textarea").css({height: options.height || 150 });

	$(element).find("button").click(function() {
		//TODO
	});

	this.append(element);

	element.setValue = function(v) { $(this).find("textarea").val(v).change(); };
	return $(element);
}
LiteWidgets.widget_constructors["script"] = "addScript";
*/


LS.Components.Script["@inspector"] = function(component, attributes)
{
	attributes.addString("Name", component.name, { callback: function(v) { component.name = v; CodingModule.onScriptRenamed( component ); }});

	var context = component.getContext();
	if(context)
	{
		attributes.addTitle("Variables");
		this.showContainerFields(context, attributes);

		var actions = [];
		/*
		for(var i in context)
		{
			if( typeof(context[i]) != "function" || LS.Components.Script.exported_callbacks.indexOf(i) != -1 || i == "getResources" )
				continue;
			attributes.addButton(null,i, { callback: context[i].bind(context) });
		}
		*/
	}

	//attributes.addString("Module name", component.component_name, { callback: function(v) { component.component_name = v; } });
	//attributes.addTextarea(null, component.code, { disabled: true, height: 100 });
	attributes.addButton(null,"Edit Code", { callback: function() {
		CodingModule.openTab();
		var path = component.uid;
		CodingModule.editInstanceCode(component, { id: component.uid, title: component._root.id, lang: "javascript", path: path, help: LS.Components.Script.coding_help } );
	}});
	//attributes.addCheckbox("Register", component.register_component, { callback: function(v) { component.register_component = v; } });
}

LS.Components.Script.onComponentInfo = function( component, widgets )
{
	widgets.addString("Context Locator", component.getLocator() + "/context", { disabled: true } );
	var values = [""];
	var context = component.getContext();
	if(context)
	{
		for(var i in context)
		{
			var f = context[i];
			if( typeof(f) != "function")
				continue;
			values.push(i);
		}
		widgets.addCombo("Functions", "", { values: values, callback: function(v){ 
		}});
	}
}
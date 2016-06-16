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
	LEvent.bind( LS, "code_error", this.onCodeError, this );
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
	//used when a tab is closed
	if(!instance)
	{
		this.current_code_info = null;
		this.editor.setValue("");
		return;
	}

	if(!options && instance )
		options = CodingModule.extractOptionsFromInstance( instance );
	
	var current_code_info = this.current_code_info;

	//check if we are editing the current one
	if(current_code_info)
	{
		if(options.id && current_code_info.id == options.id)
			return;
		if(!options.id && current_code_info.instance == instance)
			return;
	}

	var lang = options.lang || "javascript";
	this.setLang( lang );

	//adapt interface
	this.compile_button.style.display = (lang != "javascript") ? "none" : null;
	this.save_button.style.display = instance.fullpath ? null : "none";
	var filename = "";
	if(instance)
	{
		if(instance.fullpath || instance.filename )
			filename = instance.fullpath || instance.filename;
		else if(instance.name)
			filename = instance.name;
	}

	this.file_name_widget.setValue( filename );


	//changing from one tab to another? save state of old tab
	if( current_code_info )
	{
		this.assignCurrentCode(true); //save the current state of the codemirror inside the instance (otherwise changes would be lost)
		//get cursor pos (line and char)
		//store in current_tab
	}

	this.replaceInstanceCode( instance, options );

	//trigger
	LiteGUI.trigger( this, "renamed", options.title );
}

CodingPadWidget.prototype.setLang = function( lang )
{
	this.lang_widget.setValue(lang);
	if(this.current_code_info)
		this.current_code_info.lang = lang;

	if(lang && lang.constructor === String)
		lang = lang.toLowerCase();

	if(lang == "javascript")
		this.editor.setOption( "mode", "javascript" );
	else if(lang == "glsl")
		this.editor.setOption( "mode", "x-shader/x-fragment" );
	else if(lang == "html")
		this.editor.setOption( "mode", "xml" );
	else if(lang)
		this.editor.setOption( "mode", lang );
	else 
		this.editor.setOption( "mode", null );

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
	var text_content = this.getCodeFromInfo( this.current_code_info );

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

	var uid = instance.uid || instance.fullpath || instance.filename;

	if(instance && uid)
	{
		if( uid.substr(0,5) == "COMP-" && (!instance._root || !instance._root.scene) )
		{
			console.warn( "Instance being edited is not in the scene" );
			return;
		}
	}

	var text_content = this.editor.getValue();
	info.pos = this.editor.getCursor();

	var old_text_content = this.getCodeFromInfo( info );

	//why?
	//if(text_content == old_text_content)
	//	return;

	this.setCodeFromInfo( info, text_content );

	//update all the ScriptFromFile if we are editing a js file
	this.processCodeInScripts();

	if(skip_events) 
		return true; 

	if( instance && !instance.constructor.is_resource )
		LiteGUI.trigger( this, "stored" );

	LEvent.trigger( instance, "code_changed", text_content );
	if( instance.onCodeChange )
		return instance.onCodeChange( text_content );
	if(instance.fullpath || instance.filename)
		LS.ResourcesManager.resourceModified( instance );

	LEvent.trigger( CodingPadWidget, "code_changed", info );
	return true;
}

CodingPadWidget.prototype.getCodeFromInfo = function( info )
{
	var instance = info.instance;

	if(info.options.getCode)
		return info.options.getCode();
	else if(info.options.getData)
		return info.options.getData();
	else if(instance.getCode)
		return instance.getCode();
	else if(instance.getData)
		return instance.getData();
	else
		return instance.code;
}

CodingPadWidget.prototype.setCodeFromInfo = function( info, text_content )
{
	var instance = info.instance;

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
}


CodingPadWidget.prototype.showInFooter = function(msg, time) {
	var footer = this.workarea.query(".code-footer");
	footer.innerHTML = msg;
	if(time)
	{
		setTimeout( function(){ 
			if( footer.innerHTML == msg )
				footer.innerHTML = "";
		}, time );
	}
}

CodingPadWidget.prototype.getCurrentCodeInfo = function()
{
	return this.current_code_info;
}

CodingPadWidget.prototype.getCurrentCodeInstance = function()
{
	return this.current_code_info ? this.current_code_info.instance : null;
}

CodingPadWidget.prototype.onItemDrop = function(cm, event)
{
	console.log("Item Drop in Code");
	var str = null;
	
	var locator = event.dataTransfer.getData("locator");
	var node_uid = event.dataTransfer.getData("node_id");
	if(locator)
		str = "LSQ.get(\"" + locator + "\")";
	else if(node_uid)
		str = "LS.GlobalScene.getNode(\""+node_uid+"\")";
	else
		return;

	var pos = cm.coordsChar({ left: event.pageX, top: event.pageY});
	this.insertInCursor( str, pos );

	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();
}

CodingPadWidget.prototype.insertInCursor = function(text, pos)
{
	var cm = this.editor;
	if(!cm)
		return;
	var cursor = pos || cm.getCursor(); 
	cm.replaceRange( text, cursor );
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
		this.showInFooter("code ok",2000);
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

//When the user does Control + S
CodingPadWidget.prototype.saveInstance = function()
{
	var that = this;
	var info = this.getCurrentCodeInfo();
	if(!info)
		return;

	var instance = info.instance;

	this.assignCurrentCode(true); //true? not sure

	//is a resource? 
	if( instance && instance.constructor.is_resource )
	{
		//does it have a fullpath?
		if(!instance.fullpath)
		{
			var ext = LS.RM.getExtension(instance.filename) || "js";
			//ask the user to give it a name
			DriveModule.showSelectFolderFilenameDialog( instance.filename, function(folder,filename){
					//set name
					instance.filename = filename;
					instance.fullpath = folder + "/" + filename;
					//save resource
					DriveModule.saveResource( instance, inner_after_save, { skip_alerts: true });
				}, { extension: ext, text: "This file is not stored in the server, choose a folder and a filename"});
			return;
		}

		//if it has, just save it
		DriveModule.saveResource( info.instance, inner_after_save, { skip_alerts: true });
		this.showInFooter("saving...");
	}
	else
	{
		//it is not a resource, then just assign it and nothing else
		this.showInFooter("stored");
		LiteGUI.trigger( this, "stored" );
	}

	//after the resource has been saved in the server
	function inner_after_save()
	{
		that.processCodeInScripts();
		that.editor.focus();
		that.showInFooter("saved");
		LiteGUI.trigger( that, "stored" );
	}
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

//update all the ScriptFromFile if we are editing a js file
//also if it is a Global Script then force a global scripts reload 
CodingPadWidget.prototype.processCodeInScripts = function()
{
	var info = this.getCurrentCodeInfo();
	if(!info)
		return;

	var instance = info.instance;

	if(instance.constructor != LS.Resource || instance.filename.indexOf(".js") == -1 )
		return;

	//if it is modified we dont want to reload the server scripts, they wont be updated
	if(!instance._modified)
	{
		//if it is a global script, we need to reload them
		var fullpath = LS.RM.cleanFullpath( instance.fullpath || instance.filename );
		if( LS.GlobalScene.global_scripts.indexOf( fullpath ) != -1 )
		{
			LS.GlobalScene.loadScripts(null,function(){
				LS.GlobalScene.checkComponentsCodeModification();
				EditorModule.refreshAttributes();
			});
		}
	}

	//replace the components using this script
	LS.ScriptFromFile.updateComponents( instance );
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

CodingPadWidget.prototype.getState = function(skip_content)
{
	var r = {};
	if( this.editor.somethingSelected() )
	{
		var selections = this.editor.listSelections();
		r.selection = selections[0];
	}
	r.scroll_info = this.editor.getScrollInfo();
	r.cursor = this.editor.getCursor();
	if(!skip_content)
	{
		var info = this.getCurrentCodeInfo();
		if(info)
			r.options = info.options;
	}
	return r;
}

CodingPadWidget.prototype.setState = function(state)
{
	if(state.options)
	{
		var instance = CodingModule.findInstance( state.options );
		this.editInstanceCode( instance, state.options );
	}

	if(state.scroll_info)
	{
		//var scroller = this.editor.getScrollerElement();
		//scroller.scroll_info = state.scrollTop;
		//this.editor.scrollIntoView( state.scroll_info )
		this.editor.scrollTo( state.scroll_info.left, state.scroll_info.top );
	}
	if(state.cursor)
		this.editor.setCursor( state.cursor );
	if(state.selection)
		this.editor.setSelection( state.selection.anchor, state.selection.head );
	this.editor.refresh();
}


//save the state 
CodingPadWidget.prototype.onBeforeReload = function(e)
{
	//console.log("before reload: ", this.current_code_info.id );
	this._saved_state = this.getState();
}

//Check for changes in the code instances after the scene is reload
CodingPadWidget.prototype.onReload = function(e)
{
	//console.log("reload");
	if(!this._saved_state)
		return;

	var state = this._saved_state;

	//console.log("after reload: ", state.id );

	//refresh instance after reloading the scene 
	var old_instance = CodingModule.findInstance(state.options);

	//if the instance was a resources do not need to be reloaded (they are not reloaded)
	if(old_instance && old_instance.constructor.is_resource)
		return;

	//check if the instance must be replaced using the ID
	var found_instance = null;
	var id = state.options.id;
	if(id)
	{
		if( id.substr(0,6) == "@COMP-" ) //is Script component
		{
			found_instance = LS.GlobalScene.findComponentByUId( id ); //reloaded component
			if(!found_instance)
				console.warn("Instance component not found after Reload: ", id );
			else if( old_instance && found_instance.code != old_instance.code) //special case, coded has been edited while the app was running
			{
				console.log("code changed during play!");
				found_instance.code = old_instance.code; //old instance
				if(found_instance.processCode)
					found_instance.processCode(true);
			}
		}
		else if( id && id.substr(0,6) == "@MAT-" ) //is material shader
			found_instance = LS.GlobalScene.findMaterialByUId( id );
	}

	this._saved_state = null;

	if(found_instance)
		this.replaceInstanceCode( found_instance, state.options );
	else
		console.warn("CodingPad: cannot find instance by uid: " + id );

	//restore state
	state.options = null;
	this.setState( state );
}

CodingPadWidget.prototype.refresh = function()
{
	console.log("refreshing"); 
	this.editor.refresh();
}

CodingPadWidget.prototype.onNodeRemoved = function(evt, node)
{
	//check if we are using one script in a tab
	if(!node || !this.current_code_info)
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


CodingPadWidget.prototype.onEditorContentChange = function( editor )
{
	//let the tab know this code has been changed
	var code = this.getCodeFromInfo( this.current_code_info );
	var value = editor.getValue();
	if(code != value)
		LiteGUI.trigger( this, "modified", value );
	else
		LiteGUI.trigger( this, "stored", value );

	if(this.autocompile)
		this.assignCurrentCode();
}

//code changed externally
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
	if(!info || !info.options)
		return;
	CodingModule.showCodingHelp( info.options );
}

CodingPadWidget.prototype.onScriptError = function( e, instance_err )
{
	var info = this.getCurrentCodeInfo();
	if(!info || info.instance != instance_err[0])
		return;
	this.showError(instance_err[1]);
}

CodingPadWidget.prototype.onCodeError = function( e, error_info )
{
	/*
	var info = this.getCurrentCodeInfo();
	if(!info || info.instance != instance_err[0])
		return;
	this.showError(instance_err[1]);
	*/
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

CodingPadWidget.prototype.createFile = function(filename)
{
	var resource = new LS.Resource();
	resource.filename = filename;
	LS.ResourcesManager.registerResource( filename, resource );
	return resource;
}

CodingPadWidget.prototype.onOpenCode = function()
{
	var that = this;
	var dialog = new LiteGUI.Dialog(null,{ title:"Select Code", width: 400, draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector(null, { name_width: 100 });

	widgets.addStringButton("New script","unnamed.js", { button:"GO", button_width: "100px", callback_button: function(v){
		var filename = v;
		if(!filename)
			return;
		var resource = that.createFile(filename);
		that.editInstanceCode( resource );
		dialog.close();
	}});

	var selected = null;

	var codes = [];
	var codes_url = {}; //to avoid repeating codes (because they can be in the global_scripts and in the resources

	//scripts in the scene
	var script_components = LS.GlobalScene.findNodeComponents( LS.Components.Script );
	for(var i in script_components)
	{
		var compo = script_components[i];
		var name = null;
		if( compo.getComponentTitle )
			name = compo.getComponentTitle();
		if(!name)
			name = compo._root.name;
		codes.push({ name: name, component: compo });
	}

	//global scripts
	for(var i in LS.GlobalScene.global_scripts)
	{
		var url = LS.GlobalScene.global_scripts[i];
		codes.push({ name: url, fullpath: url });
		codes_url[ url ] = true;
	}

	//resources
	for(var i in LS.ResourcesManager.resources)
	{
		var resource = LS.ResourcesManager.resources[i];
		if( resource && resource.constructor === LS.Resource && resource.data && resource.data.constructor === String )
		{
			var fullpath = resource.fullpath || resource.filename;
			if( !codes_url[fullpath] )
			{
				codes.push({ name: fullpath, resource: resource });
				codes_url[fullpath] = true;
			}
		}
	}

	widgets.addResource("From resource","",{
		callback: function(fullpath){
			if(!fullpath)
				return;
			LS.RM.load( fullpath, function(resource){
				dialog.close();
				if(resource && resource.constructor === LS.Resource)
					that.editInstanceCode( resource );
			});
		}
	});

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
				that.editInstanceCode( component );
			}
			else if( selected.resource )
			{
				var resource = selected.resource;
				that.editInstanceCode( resource );
			}
			else if( selected.fullpath )
			{
				LS.RM.load( selected.fullpath, function(resource){
					if(resource && resource.constructor === LS.Resource)
						that.editInstanceCode( resource );
				});
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
	var that = this;

	if(typeof(CodeMirror) == "undefined")
	{
		//console.warn("CodeMirror missing");
		setTimeout( function(){ that.createCodingArea( container ); }, 1000 );
		return;
	}


	var coding_area = this.coding_area = new LiteGUI.Area(null,{ className: "codearea", content_id:"", height: "100%"});
	container.appendChild( coding_area.root );

	//top bar
	var top_widgets = this.top_widgets = new LiteGUI.Inspector( null, { one_line: true });

	top_widgets.addButton(null, LiteGUI.special_codes.navicon,{ width: 30, callback: function(v) { 
		that.onOpenCode();
	}});

	this.file_name_widget = top_widgets.addString(null,"",{ disabled: true });

	//check for parsing errors
	this.compile_button = top_widgets.addButton(null,"Compile",{ callback: function(v) { 
		that.evalueCode();
		LS.GlobalScene.refresh();
	}});
	this.compile_button.title = "(Ctrl+Enter)";

	this.save_button = top_widgets.addButton(null,"Save",{ callback: function(v) { 
		that.saveInstance();
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

	this.lang_widget = top_widgets.addCombo("Highlight", "javascript",{ width: 200, values: ["javascript","glsl","html","text"], callback: function(v) { 
		that.setLang( v );
	}});

	var coding_workarea_root = coding_area;

	var coding_workarea = this.workarea = new LiteGUI.Area("coding-workarea");
	coding_workarea.add( top_widgets );
	coding_workarea_root.add( coding_workarea );

	//TODO: this could be improved to use LiteGUI instead
	var code_container_element = LiteGUI.createElement("div",".code-container",null, { height: "calc(100% - 44px)", overflow: "overflow: auto" });
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
		onCursorActivity: function(e) { //key pressed
			that.editor.matchHighlight("CodeMirror-matchhighlight");
		}
	  });

	this.editor.coding_area = this;
	this.editor.on("change", this.onEditorContentChange.bind( this ) );
	this.editor.on("drop", this.onItemDrop.bind( this ) );

	//var wrapper = this.editor.display.wrapper;
	//LiteGUI.createDropArea( wrapper, this.onItemDrop.bind(this) );
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
								"js/extra/codemirror/lint/javascript-lint.js",
								"js/extra/codemirror/selection/active-line.js",
								"js/extra/codemirror/scroll/annotatescrollbar.js",
								"js/extra/codemirror/scroll/simplescrollbars.js",
								"js/extra/codemirror/search/search.js",
								"js/extra/codemirror/search/searchcursor.js",
								"js/extra/codemirror/search/matchesonscrollbar.js",
								"js/extra/codemirror/search/match-highlighter.js",
								"js/extra/codemirror/search/jump-to-line.js",
								"js/extra/codemirror/javascript.js",
								"js/extra/codemirror/clike.js", //for glsl
								"js/extra/codemirror/xml.js", //for html
								"js/extra/codemirror/css.js"
								];
CodingPadWidget.codemirror_css = ["js/extra/codemirror/codemirror.css",
							"js/extra/codemirror/blackboard.css",
							"js/extra/codemirror/search/matchesonscrollbar.css",
							"js/extra/codemirror/scroll/simplescrollbars.css",
							"js/extra/codemirror/hint/show-hint.css"];

CodingPadWidget.loadCodeMirror = function()
{
	//load codemirror
	if(typeof(CodeMirror) === "undefined")
	{
		//console.log("Loading CodeMirror...");
		LiteGUI.requireScript( CodingPadWidget.codemirror_scripts,
								function() {
									//console.log("CodeMirror loaded");
									CodingPadWidget.prepareCodeMirror();
								});
		LiteGUI.requireCSS( CodingPadWidget.codemirror_css );
		LiteGUI.addCSS(".error-line { background-color: #511; }\n\
						.CodeMirror div.CodeMirror-cursor, .CodeMirror pre { z-index: 0 !important; }\n\
						.CodeMirror-selected { background-color: rgba(100,100,100,0.5) !important; outline: 1px dashed rgba(255,255,255,0.8); }\n\
					   ");
	}
	else
	{
		//console.log("CodeMirror found");
	}
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
		pad.saveInstance();
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

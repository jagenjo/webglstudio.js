function CodingTabsWidget()
{
	this.root = null;
	this.init();
}

CodingTabsWidget.prototype.init = function()
{
	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });
	
	//tabs for every file
	var tabs = this.tabs = new LiteGUI.Tabs( null, { height: "100%" });
	this.root.add( tabs );
	this.plus_tab = tabs.addTab( "plus_tab", { title: "+", tab_width: 20, button: true, callback: this.onPlusTab.bind(this), skip_callbacks: true });
	//tabs.root.style.marginTop = "4px";
	tabs.root.style.backgroundColor = "#111";
	//tabs.addTab("+", { });

	this.bindEvents();
}

CodingTabsWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title:"Coding", fullcontent: true, closable: true, detachable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
	var coding_widget = new CodingTabsWidget();
	window.CODING_DIALOG = dialog; //debug
	dialog.add( coding_widget );
	dialog.coding_area = coding_widget;
	dialog.on_close = function()
	{
		coding_widget.unbindEvents();		
	}
	dialog.show();
	return dialog;
}

CodingTabsWidget.prototype.bindEvents = function()
{
	/*
	LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload, this );
	LEvent.bind( LS.GlobalScene, "reload", this.onReload, this );
	*/
	LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved, this );
	LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved, this );
	LEvent.bind( LS.Components.Script, "renamed", this.onScriptRenamed, this );
	LEvent.bind( CodingTabsWidget, "code_changed", this.onCodeChanged, this);

	LEvent.bind( LS.Components.Script, "code_error", this.onScriptError, this );
	LEvent.bind( LS, "code_error", this.onGlobalError, this );
}

CodingTabsWidget.prototype.unbindEvents = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS.Components.Script, this );
	LEvent.unbindAll( LS, this );
}

//switch coding tab
CodingTabsWidget.prototype.editInstanceCode = function( instance, options )
{
	options = options || {};
	var lang = options.lang || "javascript";

	//used when a tab is closed
	if(!instance)
	{
		this.current_code_info = null;
		//close the current one?
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
	var tab = this.tabs.getTab( id );
	if(tab)
	{
		this.tabs.selectTab( id ); //this calls onTabClicked
	}
	else //doesnt exist? then create a tab for this code
	{
		var num = this.tabs.getNumOfTabs();
		tab = this.tabs.addTab( id, { title: title, selected: true, closable: true, size: "full", callback: onTabClicked, onclose: onTabClosed, skip_callbacks: true, index: num - 1});
		tab.code_info = { id: id, instance: instance, options: options };
		tab.pad = this.createCodingPad( tab.content );
		tab.pad.editInstanceCode( instance, options ); 
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

CodingTabsWidget.prototype.closeInstanceTab = function( instance, options )
{
	options = options || {};

	var id = options.id || instance.uid || instance.id;
	var title = options.title || id;

	//check if the tab already exists
	var tab = this.tabs.getTab( id );
	if(!tab)
		return false;

	var info = tab.code_info;
	this.tabs.removeTab( id );

	//open next tab or clear the codemirror editor content
	if(this.current_code_info == info )
	{
		this.current_code_info = null;
		this.editor.setValue("");
	}

	return true;
}

CodingTabsWidget.prototype.getCurrentCodeInfo = function()
{
	return this.current_code_info;
}

/*
//save the state 
CodingTabsWidget.prototype.onBeforeReload = function(e)
{
	var state = { tabs: [] };

	//for every tab open
	for(var i in this.tabs.tabs)
	{
		var tab = this.tabs.tabs[i];
		if(!tab.id)
			continue;
		//get the uid of the component and the cursor info
		var info = tab.code_info;
		state.tabs.push( info );
	}
	this._saved_state = state;
}

	//reload all the codes open
CodingTabsWidget.prototype.onReload = function(e)
{
	if(!this._saved_state)
		return;

	var state = this._saved_state;
	this.tabs.removeAllTabs();

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
*/

CodingTabsWidget.prototype.onNodeRemoved = function(evt, node)
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

CodingTabsWidget.prototype.onScriptRenamed = function( e, instance )
{
	if(!instance)
		return;

	var id = instance.uid;
	if(!id)
		return;
	var tab = this.tabs.getTab( id );
	if(!tab)
		return;
	var title = tab.tab.querySelector(".tabtitle");
	if(title && instance.name)
		title.innerHTML = instance.name;
}

CodingTabsWidget.prototype.onContentModified = function( e, instance )
{
	if(!instance)
		return;

	var id = instance.uid;
	if(!id)
		return;
	var tab = this.tabs.getTab( id );
	if(!tab)
		return;
	var div = tab.tab;
	if(div)
		div.style.backgroundColor = "#955";	
}

CodingTabsWidget.prototype.onContentStored = function( e, instance )
{
	if(!instance)
		return;

	var id = instance.uid;
	if(!id)
		return;
	var tab = this.tabs.getTab( id );
	if(!tab)
		return;
	var div = tab.tab;
	if(div)
		div.style.backgroundColor = null;	
}


CodingTabsWidget.prototype.onCodeChanged = function( e, instance )
{
	//check to see if we have that instance
	if(!instance)
		return;
	var id = instance.uid;
	if(!id)
		return;
	var tab = this.tabs.getTab( id );
	if(!tab)
		return;
	var current = this.current_code_info;

	if(current.instance == instance)
	{
		//todo
	}
}

CodingTabsWidget.prototype.onComponentRemoved = function(evt, compo )
{
	this.closeInstanceTab( compo );
}

CodingTabsWidget.prototype.onPreparePlay = function()
{
	//test that all codes are valid

}

CodingTabsWidget.prototype.onPlusTab = function(tab_id, e)
{
	var that = this;

	var options = ["New Tab","Open",{ title: "Create", submenu: { callback: inner_create, options: ["Script File", "Script in Root","Script in Node"] }},"Open All Scripts"];

	var scripts = LS.GlobalScene.findNodeComponents( LS.Components.Script );

	var menu = new LiteGUI.ContextualMenu( options, { event: e, callback: function(value, options) {
		if(value == "New Tab")
		{
			that.onNewTab();
		}
		else if(value == "Open All Scripts")
		{
			that.onOpenAllScripts();
		}
		else if(value == "Open")
		{
			var pad = that.onNewTab();
			pad.onOpenCode();
		}
	}});

	function inner_create(value,e)
	{
		if(value == "Script File")
			that.onNewScriptFile();
		else if(value == "Script in Root")
			that.onNewScript( LS.GlobalScene.root );
		else if(value == "Script in Node")
			that.onNewScript( null ); //it will choose selected node by default
	}
}

CodingTabsWidget.prototype.onNewTab = function()
{
	var num = this.tabs.getNumOfTabs();
	var tab = this.tabs.addTab( null, { title: "Code", selected: true, closable: true, size: "full", skip_callbacks: true, index: num - 1});
	tab.pad = this.createCodingPad( tab.content );
	return tab.pad;
}

CodingTabsWidget.prototype.onNewScript = function( node )
{
	var component = new LS.Components.Script();
	node = node || SelectionModule.getSelectedNode();
	if(!node)
		node = LS.GlobalScene.root;
	node.addComponent( component );
	this.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
	EditorModule.refreshAttributes();
}

CodingTabsWidget.prototype.onNewScriptFile = function()
{
	var script_resource = new LS.Resource();
	script_resource.filename = "unnamed_script.js";
	script_resource.register();
	this.editInstanceCode( script_resource, { id: script_resource.filename, title: script_resource.filename, lang: "javascript", help: LS.Components.Script.coding_help });
}

//search for all the components that have a getCode function and inserts them
CodingTabsWidget.prototype.onOpenAllScripts =function()
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
			if(this.tabs.getTab( component.uid ))
				continue;

			var code = component.getCode();
			this.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
		}
	}
}

CodingTabsWidget.prototype.onScriptError = function(e, instance_err)
{
	//check if it is open in any tab
	var instance = instance_err[0];
	for(var i in this.tabs.tabs)
	{
		var tab = this.tabs.tabs[i];
		if(tab.code_info && tab.code_info.instance == instance)
		{
			//this.tabs.showTab( i );
			//tab.pad.showError( instance_err[1] ); //this is done by the pad itself
			return;
		}
	}
}

CodingTabsWidget.prototype.onGlobalError = function(e, err)
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

CodingTabsWidget.prototype.detachWindow = function()
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

CodingTabsWidget.prototype.createCodingWindow = function()
{
	var extra_window = LiteGUI.newWindow("Code",800,600);
	this.windows.push( extra_window );
}


//creates the area containing the buttons and the codemirror
CodingTabsWidget.prototype.createCodingPad = function( container )
{
	container = container || this.root;
	var that = this;
	var pad = new CodingPadWidget();
	container.appendChild( pad.root );

	LiteGUI.bind( pad, "modified", function(e){ that.onContentModified(e, pad.getCurrentCodeInstance() ); });
	LiteGUI.bind( pad, "stored", function(e){ that.onContentStored(e, pad.getCurrentCodeInstance() ); });
	LiteGUI.bind( pad, "compiled", function(e){ that.onContentStored(e, pad.getCurrentCodeInstance() ); });

	return pad;
}



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
	//this.plus_tab = tabs.addTab( "plus_tab", { title: "+", tab_width: 20, button: true, callback: this.onPlusTab.bind(this), skip_callbacks: true });
	tabs.addPlusTab( this.onPlusTab.bind(this) );
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

	LEvent.bind( LS.GlobalScene, "load", this.onSceneChange, this );

	//LEvent.bind( LS.Components.Script, "renamed", this.onScriptRenamed, this );
	LEvent.bind( CodingTabsWidget, "code_changed", this.onCodeChanged, this);

	LEvent.bind( LS.Components.Script, "code_error", this.onScriptError, this );
	//LEvent.bind( LS, "code_error", this.onGlobalError, this );
}

CodingTabsWidget.prototype.unbindEvents = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS.Components.Script, this );
	LEvent.unbindAll( LS, this );
}

CodingTabsWidget.prototype.findTab = function( id )
{
	for(var i in this.tabs.tabs )
	{
		var tab = this.tabs.tabs[i];
		var pad = tab.pad;
		if(!pad) //plus tab
			continue;
		var info = pad.getCurrentCodeInfo();
		if(info.id == id)
			return tab;
	}
	return null;
}

CodingTabsWidget.prototype.getTabPadByIndex = function( index )
{
	var tab = this.tabs.getTabByIndex( index );
	if(!tab || !tab.pad )
		return null;
	return tab.pad;
}

//switch coding tab
CodingTabsWidget.prototype.editInstanceCode = function( instance, options )
{
	options = options || {};

	//used when a tab is closed
	if(!instance)
	{
		this.current_code_info = null;
		//close the current one?
		return;
	}

	var current_code_info = this.current_code_info;

	//extract info from instance
	options = CodingModule.extractOptionsFromInstance( instance, options );
	var id = options.id;

	//check if we are editing the current one
	if(current_code_info)
	{
		if( current_code_info.id == id || current_code_info.instance == instance )
			return;
	}

	//changing from one tab to another? save state of old tab
	if( current_code_info )
	{
		this.assignCurrentCode(true); //save the current state of the codemirror inside the instance (otherwise changes would be lost)
		//get cursor pos (line and char)
		//store in current_tab
	}

	//check if the tab already exists
	var tab = this.findTab( id );
	if(tab)
	{
		//this.tabs.selectTab( id ); //this calls onTabClicked
		tab.click();
	}
	else //doesnt exist? then create a tab for this code
	{
		var num = this.tabs.getNumOfTabs();
		tab = this.tabs.addTab( id, { title: options.title, selected: true, closable: true, size: "full", callback: onTabClicked, callback_leave: onLeaveTab, onclose: onTabClosed, skip_callbacks: true, index: num - 1});
		tab.code_info = { id: id, instance: instance, options: options };
		tab.pad = this.createCodingPad( tab.content );
		tab.pad.editInstanceCode( instance, options ); 
	}

	//callbacks ******************************
	var that = this;

	function onTabClicked()
	{
		tab.pad.refresh();
		if(tab.pad._last_state)
		{
			tab.pad.setState( tab.pad._last_state );
			tab.pad._last_state = null;
		}
	}

	function onLeaveTab()
	{
		//save scroll
		tab.pad._last_state = tab.pad.getState(true);
	}

	function onTabClosed(tab)
	{
		if( tab.selected )
			that.editInstanceCode( null );
	}

	return tab;
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

CodingTabsWidget.prototype.refresh = function()
{
	var tab = this.tabs.getCurrentTab();
	if(!tab || !tab.pad)
		return;
	tab.pad.refresh();
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

CodingTabsWidget.prototype.renameTab = function( id, name )
{
	var tab = this.findTab( id );
	if(!tab)
		return;

	var title = tab.tab.querySelector(".tabtitle");
	if(title && name)
		title.innerHTML = name;
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

CodingTabsWidget.prototype.onSceneChange = function( e )
{
	this.tabs.removeAllTabs(true);
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

	var options = [
		"Open",
		{ title: "Create", submenu: 
			{ callback: inner_create,
			options: [
				{ title: "Script", submenu: { 
					callback: inner_create,
					options: [
						"In File",
						"In Node",
						"In Root"]
					},
				},
				"Data File",
				"Shader"
			]}},
		"Open All Scripts",
		"Empty Tab"
	];

	var scripts = LS.GlobalScene.findNodeComponents( LS.Components.Script );

	var menu = new LiteGUI.ContextualMenu( options, { event: e, callback: function(value, options) {
		if(value == "Empty Tab")
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

	//used by both sublevels (because there are no options with the same name
	function inner_create(value,e)
	{
		if(value == "In File")
			that.onNewScriptFile();
		else if(value == "In Root")
			that.onNewScript( LS.GlobalScene.root );
		else if(value == "In Node")
			that.onNewScript( null ); //it will choose selected node by default
		else if(value == "Data File")
			that.onNewDataFile();
		else if(value == "Shader")
			that.onNewShaderFile();
	}
}

CodingTabsWidget.prototype.onNewTab = function()
{
	return this.createTab();
}

CodingTabsWidget.prototype.createTab = function()
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

CodingTabsWidget.prototype.onNewDataFile = function()
{
	var resource = new LS.Resource();
	resource.filename = "unnamed_data.txt";
	resource.register();
	this.editInstanceCode( resource, { id: resource.filename, title: resource.filename, lang: "text" });
}

CodingTabsWidget.prototype.onNewShaderFile = function()
{
	var shader_code = new LS.ShaderCode();
	shader_code.filename = "unnamed_shader.glsl";
	shader_code.register();
	this.editInstanceCode( shader_code, { id: shader_code.filename, title: shader_code.filename, lang: "glsl" });
}

//search for all the components that have a getCode function and inserts them
CodingTabsWidget.prototype.onOpenAllScripts = function()
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

			var instance = component;
			var uid = component.uid;

			if(component.filename)
				uid = component.filename;

			if(this.findTab( uid ))
				continue;

			if( component.getCodeResource )
				instance = component.getCodeResource();

			this.editInstanceCode( instance );
		}
	}

	//add global scripts here?
	//TODO
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
	/*
	console.error("Global error");
	console.trace();
	console.error(err);
	var stack = err.stack.split("\n");
	if(stack[1].indexOf("<anonymous>") == -1)
		return;
	this.showError(err);
	*/
	//could be a error triggered by an async callback
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
	LiteGUI.bind( pad, "renamed", function(e){ 
		var info = pad.getCurrentCodeInfo();
		if(info.id)
			that.renameTab(info.id,e.detail);
	});

	return pad;
}

CodingTabsWidget.prototype.getState = function()
{
	var state = [];

	//for every tab open...
	for(var i in this.tabs.tabs)
	{
		var tab = this.tabs.tabs[i];
		var pad = tab.pad;
		if(!pad)
			continue;
		state.push( pad.getState() );
	}

	return state;
}

CodingTabsWidget.prototype.setState = function(o)
{
	if(!o)
		return;

	var that = this;
	
	for(var i = 0; i < o.length; ++i)
	{
		var info = o[i];
		var pad = this.getTabPadByIndex(i);
		if(!pad)
			pad = this.createTab();
		CodingModule.findInstance( info.options, inner.bind({pad: pad, info: info}) );
	}

	function inner( instance )
	{
		this.pad.setState( this.info );
	}
}

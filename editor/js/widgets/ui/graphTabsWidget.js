function GraphTabsWidget( options )
{
	this.root = null;
	this.init( options );
}

GraphTabsWidget.prototype.init = function( options )
{
	options = options || {};

	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });

	if( options.id )
		this.root.id = options.id;
	
	//tabs for every file
	var tabs = this.tabs = new LiteGUI.Tabs( { height: "100%" });
	this.root.add( tabs );
	this.plus_tab = tabs.addTab( "plus_tab", { title: "+", tab_width: 20, button: true, callback: this.onPlusTab.bind(this), skip_callbacks: true });
	tabs.root.style.marginTop = "4px";
	tabs.root.style.backgroundColor = "#111";

	this.bindEvents();
}

GraphTabsWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( { title:"Graph", fullcontent: true, closable: true, detachable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
	var graph_widget = new GraphTabsWidget();
	dialog.add( graph_widget );
	dialog.graph_area = graph_widget;
	dialog.on_close = function()
	{
		graph_widget.unbindEvents();		
	}
	return dialog;
}

GraphTabsWidget.prototype.bindEvents = function()
{
	/*
	LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload, this );
	LEvent.bind( LS.GlobalScene, "reload", this.onReload, this );
	*/
	LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved, this );
	LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved, this );
}

GraphTabsWidget.prototype.unbindEvents = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS, this );
}

//switch coding tab
GraphTabsWidget.prototype.editInstanceCode = function( instance, options )
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
	var tab = this.files_tabs.getTab( id );
	if(tab)
	{
		this.files_tabs.selectTab( id ); //this calls onTabClicked
	}
	else //doesnt exist? then create a tab for this code
	{
		var num = this.files_tabs.getNumOfTabs();
		tab = this.files_tabs.addTab( id, { title: title, selected: true, closable: true, size: "full", callback: onTabClicked, onclose: onTabClosed, skip_callbacks: true, index: num - 1});
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

GraphTabsWidget.prototype.closeInstanceTab = function( instance, options )
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

GraphTabsWidget.prototype.getCurrentCodeInfo = function()
{
	return this.current_code_info;
}

/*
//save the state 
CodingTabsWidget.prototype.onBeforeReload = function(e)
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
CodingTabsWidget.prototype.onReload = function(e)
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
*/

GraphTabsWidget.prototype.onNodeRemoved = function(evt, node)
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

GraphTabsWidget.prototype.onScriptRenamed = function( e, instance )
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

GraphTabsWidget.prototype.onCodeChanged = function( e, instance )
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

GraphTabsWidget.prototype.onComponentRemoved = function(evt, compo )
{
	this.closeInstanceTab( compo );
}

GraphTabsWidget.prototype.onPreparePlay = function()
{
	//test that all codes are valid

}

GraphTabsWidget.prototype.onPlusTab = function(tab_id, e)
{
	var that = this;

	var options = ["Create in Root","Create in Node","Open All"];

	var scripts = LS.GlobalScene.findNodeComponents( LS.Components.Script );
	if( scripts.length )
		options.push("Open");

	var menu = new LiteGUI.ContextMenu( options, { event: e, callback: function(value, options) {
		if(value == "Create in Root")
			that.onNewScript( LS.GlobalScene.root );
		else if(value == "Create in Node")
			that.onNewScript( null ); //it will choose selected node by default
		else if(value == "Open All")
		{
			that.onOpenAllScripts();
		}
		else if(value == "Open")
		{
			var script_names = [];
			for(var i in scripts)
				script_names.push({ title: scripts[i].name, component: scripts[i] });

			var submenu = new LiteGUI.ContextMenu( script_names, { event: options.event, callback: function(value) {
				var component = value.component;
				var node = component._root;
				that.editInstanceCode( component, { id: component.uid, title: node.id, lang: "javascript", path: component.uid, help: LS.Components.Script.coding_help });
			}});
		}
	}});
}

GraphTabsWidget.prototype.onNewScript = function( node )
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
GraphTabsWidget.prototype.onOpenAllScripts =function()
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

GraphTabsWidget.prototype.onScriptError = function(e, instance_err)
{
	console.trace("Script crashed");
	var code_info = this.getCurrentCodeInfo();
	if( code_info.instance != instance_err[0] )
		return;
	this.showError(instance_err[1]);
}

GraphTabsWidget.prototype.onGlobalError = function(e, err)
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

GraphTabsWidget.prototype.detachWindow = function()
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

GraphTabsWidget.prototype.createCodingWindow = function()
{
	var extra_window = LiteGUI.newWindow("Graph",800,600);
	this.windows.push( extra_window );
}


//creates the area containing the buttons and the codemirror
GraphTabsWidget.prototype.createCodingPad = function( container )
{
	container = container || this.root;

	var that = this;

	var pad = new CodingPadWidget();
	container.appendChild( pad.root );

	/*
	pad.top_widgets.addButton(null,"Open All",{ callback: function(v) { 
		that.onOpenAllScripts();
	}});

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

	return pad;
}



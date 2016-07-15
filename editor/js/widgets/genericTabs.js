function GenericTabsWidget( id, options )
{
	this.root = null;
	this.supported_widgets = null;
	this.init(options);

	//helful
	this.addTab = this.tabs.addTab.bind( this.tabs );
}

GenericTabsWidget.prototype.init = function( options )
{
	options = options || {};

	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });
	
	//tabs for every file
	var tabs = this.tabs = new LiteGUI.Tabs( null, { height: "100%" });
	tabs.addPlusTab( this.onPlusTab.bind(this) );
	this.root.add( tabs );
	/*tabs.root.style.marginTop = "4px";*/
	tabs.root.style.backgroundColor = "#111";

	this.bindEvents();
}

GenericTabsWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title:"Panel", fullcontent: true, closable: true, detachable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 800, height: 500 });
	var tabs_widget = new GenericTabsWidget();
	dialog.add( tabs_widget );
	dialog.on_close = function()
	{
		tabs_widget.unbindEvents();		
	}
	dialog.show();
	return dialog;
}

GenericTabsWidget.prototype.bindEvents = function()
{
	//TODO: Crawl the tabs and let them know they should bind events

	/*
	LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload, this );
	LEvent.bind( LS.GlobalScene, "reload", this.onReload, this );
	LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved, this );
	LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved, this );
	LEvent.bind( LS.Components.Script, "renamed", this.onScriptRenamed, this );
	LEvent.bind( CodingTabsWidget, "code_changed", this.onCodeChanged, this);

	LEvent.bind( LS.Components.Script, "code_error", this.onScriptError, this );
	LEvent.bind( LS, "code_error", this.onGlobalError, this );
	*/
}

GenericTabsWidget.prototype.unbindEvents = function()
{
	//TODO: Crawl the tabs and let them know they should unbind events

	/*
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS.Components.Script, this );
	LEvent.unbindAll( LS, this );
	*/
}

GenericTabsWidget.prototype.onPlusTab = function( tab_id, e )
{
	var that = this;

	var widgets = this.supported_widgets;

	if(!widgets)
	{
		widgets = [];
		for(var i in CORE.Widgets)
		{
			var type = CORE.Widgets[i];
			widgets.push( type );
		}
	}

	if( !widgets.length )
		return;

	if( widgets.length == 1 )
	{
		this.addWidgetTab( widgets[0] );
		return;
	}

	var menu = new LiteGUI.ContextualMenu( widgets, { event: e, callback: function(value, options) {
		that.addWidgetTab( value["class"] );
	}});
}

GenericTabsWidget.prototype.openInstanceTab = function( instance )
{
	for(var i in this.tabs.tabs)
	{
		var tab = this.tabs.tabs[i];
		var widget = tab.widget;
		if(!widget || !widget.isInstance )
			continue;
		if(!widget.isInstance(instance))
			continue;
		this.tabs.selectTab( tab );
		return true;
	}

	return false;
}

GenericTabsWidget.prototype.onResize = function()
{
	for(var i in this.tabs.tabs)
	{
		var tab = this.tabs.tabs[i];
		var widget = tab.widget;
		if(!widget || !widget.onResize )
			continue;
		widget.onResize();
	}
}

GenericTabsWidget.prototype.addWidgetTab = function( widget_class, options )
{
	options = options || {};

	if(!widget_class)
		throw("Widget missing");

	if(widget_class.constructor === String)
		widget_class = CORE.Widgets[ widget_class ];

	if(!widget_class)
		throw("Widget missing");

	//Create tab
	var title = options.title || widget_class.widget_name || widget_class.name;
	var num = this.tabs.getNumOfTabs();
	var widget = new widget_class();
	tab = this.tabs.addTab( null, { 
		title: title, 
		selected: true, closable: true, size: "full", 
		content: widget.root, 
		callback: onTabClicked, 
		onclose: onTabClosed, 
		skip_callbacks: true, 
		widget: widget,
		index: num - 1
	});

	tab.widget = widget;
	widget.onRename = function(new_name) { 
		tab.setTitle(new_name);
	}

	//callbacks ******************************
	var that = this;

	function onTabClicked()
	{
		var widget = this.widget;
		if(widget.onShow)
			widget.onShow();
	}

	function onTabClosed( tab )
	{
		if( !tab.selected )
			return;
	}

	if(this.onWidgetCreated)
		this.onWidgetCreated( widget );

	LiteGUI.trigger( this, "tab_created", tab );

	return tab;
}
function GenericTabsWidget( options )
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

	if(options.id)
		this.root.id = options.id;
	
	//tabs for every file
	var tabs = this.tabs = new LiteGUI.Tabs( { height: "100%" });
	this.splice_button = tabs.addButtonTab( "slice_tab", "|", this.onSliceTab.bind(this) );
	tabs.addPlusTab( this.onPlusTab.bind(this) );
	this.root.add( tabs );
	/*tabs.root.style.marginTop = "4px";*/
	tabs.root.style.backgroundColor = "#111";

	this.bindEvents();
}

GenericTabsWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( { title:"Panel", fullcontent: true, closable: true, detachable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 800, height: 500 });
	var tabs_widget = new GenericTabsWidget();
	dialog.add( tabs_widget );
	dialog.on_close = function()
	{
		tabs_widget.unbindEvents();		
	}
	dialog.on_resize = function()
	{
		tabs_widget.onResize();
	}
	dialog.show();
	return dialog;
}

GenericTabsWidget.prototype.bindEvents = function()
{
}

GenericTabsWidget.prototype.unbindEvents = function()
{
}

GenericTabsWidget.prototype.getCurrentTab = function()
{
	return this.tabs.current_tab;
}

GenericTabsWidget.prototype.getCurrentWidget = function()
{
	var tab = this.tabs.current_tab; //tab is an array of [id,root,object]
	if(!tab)
		return null;
	return tab[2].widget;
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

	var menu = new LiteGUI.ContextMenu( widgets, { event: e, callback: function(value, options) {
		that.addWidgetTab( value["class"] );
	}});
}

GenericTabsWidget.prototype.onSliceTab = function( tab_id, e )
{
	var that = this;
	var area = new LiteGUI.Area({ width: "100%" });
	area.split( LiteGUI.Area.HORIZONTAL, ["50%",null], true );
	area.getSection(0).content.appendChild( this.tabs.root );
	this.tabs.removeTab("slice_tab");

	var gentabs = new GenericTabsWidget();
	area.getSection(1).add( gentabs );

	this.root.appendChild(area.root);
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

	if(widget.onResize)
		widget.onResize();

	return tab;
}
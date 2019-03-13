//Deprecated
var ProfilingModule = {
	name: "Profiling",
	bigicon: "imgs/tabicon-profiling.png",

	settings: {
	},

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.name , {id:"profilingtab", bigicon: this.bigicon, size: "full", callback: function(tab) {
			if(!ProfilingModule.profiling_widget)
				ProfilingModule.createWidget();
			ProfilingModule.profiling_widget.enabled = true;
			RenderModule.appendViewportTo( ProfilingModule.area.sections[0].content );
			ProfilingModule.profiling_widget.render();
		},
		callback_leave: function() {
			ProfilingModule.profiling_widget.enabled = false;
			RenderModule.appendViewportTo( null );
		}});

		var area = this.area = new LiteGUI.Area();
		area.split("vertical",[null,400],true);
		this.tab.add( area );
	},

	createWidget: function()
	{
		this.profiling_widget = new ProfilingPanelWidget();
		this.area.sections[1].add( this.profiling_widget );
	}
};


//CORE.registerModule( ProfilingModule );
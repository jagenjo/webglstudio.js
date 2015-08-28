var AnimationModule = {
	name: "Timeline",
	enabled: true,
	//settings_panel: [{name:"renderer", title:"Renderer", icon:null }],

	init: function()
	{
		this.tab = InterfaceModule.lower_tabs_widget.addTab("Animation", {selected:true, size: "full", width: "100%"});
		this.tab.content.style.overflow = "hidden"; 
		this.createTimeline();

		RenderModule.viewport3d.addModule( AnimationModule ); //capture update, render trajectories
	},

	createTimeline: function()
	{
		var timeline = this.timeline = new Timeline();
		this.tab.add( this.timeline );

		InterfaceModule.visorarea.addEventListener( "visibility_change", timeline_resize );
		InterfaceModule.visorarea.addEventListener( "split_moved", timeline_resize );
		window.addEventListener("resize", timeline_resize );

		function timeline_resize(){
			timeline.resize();
		}
	},

	showTimeline: function( animation )
	{
		InterfaceModule.selectTab( RenderModule.name );
		InterfaceModule.setLowerPanelVisibility( true );
		if(animation)
			this.timeline.setAnimation( animation );
	},

	attachKeyframesBehaviour: function( inspector )
	{
		var elements = inspector.root.querySelectorAll(".keyframe_icon");
		for(var i = 0; i < elements.length; i++)
		{
			elements[i].addEventListener("click", inner_click );
			elements[i].addEventListener("contextmenu", (function(e) { 
				if(e.button != 2) //right button
					return false;
				inner_rightclick(e);
				e.preventDefault();
				e.stopPropagation();
				return false;
			}).bind(this));
		}

		function inner_click(e)
		{
			AnimationModule.insertKeyframe( e.target, e.shiftKey );
			e.preventDefault();
			e.stopPropagation();
			return true;
		}

		function inner_rightclick(e)
		{
			var menu = new LiteGUI.ContextualMenu( ["Add UID track","Add name track","Show Info"], { event: e, callback: function(value) {
				if(value == "Add UID track")
					AnimationModule.insertKeyframe(e.target);
				else if(value == "Add name track")
					AnimationModule.insertKeyframe(e.target, true);
				else
					AnimationModule.showPropertyInfo( e.target.dataset["propertyuid"] );
			}});
		}
	},

	showPropertyInfo: function( property )
	{
		var info = LS.GlobalScene.getPropertyInfo( property );
		if(!info)
			return;

		var that = this;
		var dialog = new LiteGUI.Dialog("property_info",{ title:"Property Info", width: 400, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Locator", property, function(v){ 
		});

		widgets.widgets_per_row = 2;
		widgets.addString("Parent", info.node ? info.node.name : "", { disabled: true } );
		widgets.addString("Container", info.target ? LS.getObjectClassName( info.target ) : "", { disabled: true } );
		widgets.addString("Property", info.name, { disabled: true } );
		widgets.addString("Type", info.type, { disabled: true } );
		widgets.widgets_per_row = 1;

		if(info.type == "number")
			widgets.addNumber("Value", info.value, inner_set );
		else if(info.type == "boolean")
			widgets.addCheckbox("Value", info.value, inner_set );
		else if(info.type == "vec2")
			widgets.addVector2("Value", info.value, inner_set );
		else if(info.type == "vec3")
			widgets.addVector3("Value", info.value, inner_set );
		else if(info.type == "texture")
			widgets.addTexture("Value", info.value, inner_set );
		else if(info.type == "mesh")
			widgets.addMesh("Value", info.value, inner_set );
		else
			widgets.addString("Value", info.value, inner_set );
		widgets.addButtons(null,["Close"], function(v){
			dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();

		function inner_set(v)
		{
			LS.GlobalScene.setPropertyValue( property, v );
			LS.GlobalScene.refresh();
		}
	},

	getKeyframeCode: function( target, property, options )
	{
		if(!target.getLocator)
			return "";
		var locator = target.getLocator();
		if(!locator)
			return "";
		return "<span title='Create keyframe' class='keyframe_icon' data-propertyname='" + property + "' data-propertyuid='" + locator + "/" + property + "' ></span>";
	},

	insertKeyframe: function( button, relative )
	{
		this.timeline.onInsertKeyframeButton(button, relative);
	},

	update: function(dt)
	{
		if( this.timeline )
			this.timeline.update(dt);
	}

};

LiteGUI.registerModule( AnimationModule );
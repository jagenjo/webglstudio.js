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
		var take = this.timeline.current_take;
		if(!take)
		{
			LiteGUI.alert("No track selected, create a new one using the animation editor.");
			return;
		}

		//show dialog to select keyframe options (by uid or nodename)
		//TODO

		var locator = button.dataset["propertyuid"];
		var original_locator = locator;
		var name = button.dataset["propertyname"];

		var info = LS.GlobalScene.getPropertyInfo( locator );
		if(info === null)
			return console.warn("Property info not found: " + locator );

		//convert absolute to relative locator
		if( relative )
		{
			var t = locator.split("/");
			if(info.node && info.node.uid == t[0])
			{
				t[0] = info.node.name;
				if(info.target)
					t[1] = LS.getObjectClassName( info.target );
				locator = t.join("/");
			}
		}

		//quantize time
		var time = Math.round( this.timeline.session.current_time * 30) / 30;

		var size = 0;
		var value = info.value;
		var interpolation = LS.BEZIER;
		if(info.value !== null)
		{
			if( info.value.constructor == Float32Array )
				size = info.value.length;
			else if( info.value.constructor === Number )
				size = 1;
		}

		if(size == 0 || info.type == "enum")
			interpolation = LS.NONE;

		var track = take.getTrack( locator );
		if(!track)
		{
			//search for a track that has the same locator (in case you created a relative track and clicked the animation button)
			for(var i = 0; i < take.tracks.length; ++i)
			{
				if( take.tracks[i]._original_locator != original_locator )
					continue;
				track = take.tracks[i];
				break;
			}

			if(!track)
			{
				track = take.createTrack( { name: name, property: locator, type: info.type, value_size: size, interpolation: interpolation, duration: this.timeline.session.end_time, data: [] } );
				track._original_locator = original_locator;
			}
		}

		console.log("Keyframe added");
		track.addKeyframe( time , value );

		this.timeline.redrawCanvas();
	},

	update: function(dt)
	{
		if( this.timeline )
			this.timeline.update(dt);
	}

};

LiteGUI.registerModule( AnimationModule );
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
			elements[i].addEventListener("click", inner );

		function inner(e)
		{
			AnimationModule.insertKeyframe(e.target);
			e.preventDefault();
			e.stopPropagation();
			return true;
		}
	},

	getKeyframeCode: function( target, property, options )
	{
		if(!target.getLocatorString)
			return "";
		var locator = target.getLocatorString();
		if(!locator)
			return "";
		return "<span title='Create keyframe' class='keyframe_icon' data-propertyname='" + property + "' data-propertyuid='" + locator + "/" + property + "' ></span>";
	},

	insertKeyframe: function( info )
	{
		var take = this.timeline.current_take;
		if(!take)
		{
			LiteGUI.alert("No track selected, create a new one using the animation editor.");
			return;
		}

		//show dialog to select keyframe options (by uid or nodename)
		//TODO

		var locator = info.dataset["propertyuid"];
		var name = info.dataset["propertyname"];

		var info = LS.GlobalScene.getPropertyInfo( locator );
		if(info === null)
			return console.warn("Property info not found: " + locator );

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
			track = take.createTrack( { name: name, property: locator, type: info.type, value_size: size, interpolation: interpolation, duration: this.timeline.session.end_time, data: [] } );

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
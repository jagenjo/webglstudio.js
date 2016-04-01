var AnimationModule = {
	name: "Timeline",
	enabled: true,

	render_helpers: true,
	//settings_panel: [{name:"renderer", title:"Renderer", icon:null }],

	_trajectories: [],

	init: function()
	{
		//create the timeline
		this.tab = InterfaceModule.lower_tabs_widget.addWidgetTab( Timeline );
		this.timeline = this.tab.widget;

		LEvent.bind( LS.GlobalScene, "afterRenderScene", this.renderView.bind(this));
		LEvent.bind( LS.GlobalScene, "renderPicking", this.renderPicking.bind(this));

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
			var element = elements[i];
			element.draggable = true;
			element.addEventListener("click", inner_click );
			element.addEventListener("contextmenu", (function(e) { 
				if(e.button != 2) //right button
					return false;
				inner_rightclick(e);
				e.preventDefault();
				e.stopPropagation();
				return false;
			}).bind(this));
			element.addEventListener("dragstart", inner_dragstart);
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
			var menu = new LiteGUI.ContextualMenu( ["Add UID track","Add name track","Show Info","Copy Query","Copy Unique Query"], { event: e, title:"Keyframe", callback: function(value) {
				if(value == "Add UID track")
					AnimationModule.insertKeyframe(e.target);
				else if(value == "Add name track")
					AnimationModule.insertKeyframe(e.target, true);
				else if(value == "Copy Query")
					AnimationModule.copyQueryToClipboard( e.target.dataset["propertyuid"], true );
				else if(value == "Copy Unique Query")
					AnimationModule.copyQueryToClipboard( e.target.dataset["propertyuid"] );
				else
					AnimationModule.showPropertyInfo( e.target.dataset["propertyuid"] );
			}});
		}

		function inner_dragstart(e)
		{
			e.dataTransfer.setData("type", "property" );
			e.dataTransfer.setData("uid", e.target.dataset["propertyuid"] );

			var locator = e.target.dataset["propertyuid"];

			//var info = LS.

			if(e.shiftKey)
				locator = LSQ.shortify( locator );
			e.dataTransfer.setData("locator", locator );
		}
	},

	copyQueryToClipboard: function( locator, shorten )
	{
		//shortify query
		if(shorten)
			locator = LSQ.shortify( locator );
		LiteGUI.toClipboard( locator );
	},

	showPropertyInfo: function( property )
	{
		var info = LS.GlobalScene.getPropertyInfo( property );
		if(!info)
			return;

		var that = this;
		var dialog = new LiteGUI.Dialog("property_info",{ title:"Property Info", width: 400, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		var locator_widget = widgets.addString("Locator", property, function(v){});
		/*
		locator_widget.style.cursor = "pointer";
		locator_widget.setAttribute("draggable","true");
		locator_widget.addEventListener("dragstart", function(event) { 
			event.dataTransfer.setData("locator", property );
			event.dataTransfer.setData("type", "property");
			if(info.node)
				event.dataTransfer.setData("node_uid", info.node.uid);
			//event.preventDefault();
		});
		*/
		
		widgets.addString("Short Locator", LSQ.shortify( property ), function(v){});

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
		return "<span title='Create keyframe for "+property+"' class='keyframe_icon' data-propertyname='" + property + "' data-propertyuid='" + locator + "/" + property + "' ></span>";
	},

	insertKeyframe: function( button, relative )
	{
		this.timeline.onInsertKeyframeButton( button, relative );
		this.tab.click();
	},

	renderView: function(e, camera)
	{
		if( !EditorView.render_helpers || !this.render_helpers || RenderModule.render_settings.in_player || !RenderModule.frame_updated )
			return;

		this.renderTrajectories(camera);
	},

	renderPicking: function(e, mouse_pos)
	{
		//cannot pick what is hidden
		if(!EditorView.render_helpers)
			return;

		var temp = vec3.create();

		for(var i = 0; i < this._trajectories.length; ++i)
		{
			var traj = this._trajectories[i];

			var info = LS.GlobalScene.getPropertyInfoFromPath( traj.track._property_path );
			var parent_matrix = null;
			if( info.node && info.node.parentNode && info.node.parentNode.transform )
				parent_matrix = info.node.parentNode.transform.getGlobalMatrixRef();

			var points = traj.points;
			var num = points.length;
			for(var j = 0; j < num; ++j)
			{
				var pos = points[j];
				if( parent_matrix )
					pos = vec3.transformMat4( vec3.create(), pos, parent_matrix );
				EditorView.addPickingPoint( pos, 10, { pos: pos, value: points[j], type: "keyframe", traj:i, instance: this, track: traj.index, num: j } );
			}
		}
	},

	renderTrajectories: function( camera )
	{
		LS.Renderer.resetGLState();

		if(!this.timeline.current_take)
			return;

		var take = this.timeline.current_take;
		if(take.tracks.length == 0)
			return;

		var selection = SelectionModule.getSelection();
		if(!selection || selection.type != "keyframe")
			selection = null;

		this._trajectories.length = 0;
		var white = [1,1,1,1];
		var colorA = [0.5,0.6,0.5,1];
		var colorB = [1.0,1.0,0.5,1];

		for(var i = 0; i < take.tracks.length; ++i)
		{
			var track = take.tracks[i];
			if(track.type != "position" || !track.enabled)
				continue;

			var num = track.getNumberOfKeyframes();
			var start = -1;
			var end = -1;
			var points = [];
			var colors = null;
			if( selection && selection.track == i )
				colors = [];

			var info = LS.GlobalScene.getPropertyInfoFromPath( track._property_path );
			if(!info) //unknown case but it happened sometimes
				continue;

			var parent_node = null;
			if( info.node && info.node.parentNode && info.node.parentNode.transform )
			{
				parent_node = info.node.parentNode;
				LS.Draw.push();
				LS.Draw.setMatrix( parent_node.transform.getGlobalMatrixRef() );
			}

			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(!keyframe)
					continue;
				if(j == 0)
					start = keyframe[0];
				else if(j == num - 1)
					end = keyframe[0];
				var pos = keyframe[1];
				points.push(pos);
				if(colors)
					colors.push( j == selection.index ? colorB : colorA );
			}

			LS.Draw.setColor( colors ? white : colorA );
			LS.Draw.renderPoints( points, colors );
			this._trajectories.push( { index: i, points: points, track: track } );

			if(track.interpolation == LS.Animation.NONE)
				continue;

			if(track.interpolation == LS.Animation.LINEAR)
			{
				if(points.length > 1)
					LS.Draw.renderLines( points, null, true );
				continue;
			}

			points = [];

			var last = null;
			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(!keyframe)
					continue;
				if(last)
				{
					var start_t = last[0];
					var end_t = keyframe[0];
					var num_samples = Math.max(2, (end_t - start_t) * 10);
					var offset = (end_t - start_t) / num_samples;
					for(var k = 0; k <= num_samples; ++k)
					{
						var t = start_t + offset * k;
						var sample = track.getSample(t, true, vec3.create());
						if(!sample)
							continue;
						points.push(sample);
					}
				}
				last = keyframe;
			}

			if(points.length > 1)
			{
				LS.Draw.setColor(colorA);
				LS.Draw.renderLines( points, null, false );
			}

			if( parent_node )
				LS.Draw.pop();
		}
	},

	getTransformMatrix: function( element, mat, selection )
	{
		if(!this._trajectories.length)
			return false;

		var T = mat || mat4.create();
		mat4.setTranslation( T, selection.pos );
		return T;
	},

	applyTransformMatrix: function( matrix, center, property_name, selection )
	{
		if(!this._trajectories.length)
			return false;

		var track = this._trajectories[ selection.traj ];
		if(!track)
			return null;

		var point = track.points[ selection.num ];
		vec3.transformMat4( point, point, matrix );
		if(selection.pos != selection.value) //update the visual point
			vec3.transformMat4( selection.pos, selection.pos, matrix );
		this.timeline.applyTracks();
		return true;
	},

	update: function(dt)
	{
		if( this.timeline )
			this.timeline.update(dt);
	}

};

CORE.registerModule( AnimationModule );
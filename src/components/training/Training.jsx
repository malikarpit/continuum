/**
 * Training - Hierarchical workout selection interface
 * Flow: Environment → Body Region → Muscle Group → Exercises
 * Supports full edit mode for customizing all content
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import {
  TRAINING_STATUS,
  TRAINING_TYPE,
  TRAINING_MODE,
  TRAINING_SKIP_REASONS,
  BODY_REGIONS,
  MUSCLE_GROUPS,
  MUSCLE_DETAILS,
  getExercisesForMuscle,
  createExercise,
  skipExercise
} from '../../db/trainingStore';
import { isGymClosedDay, getSuggestedTrainingMode } from '../../db/phaseStore';

export default function Training() {
  const {
    training,
    isTrainingActive,
    restTimer,
    setRestTimer,
    startWorkout,
    logSet,
    finishWorkout,
    skipWorkout,
    setRestDay,
    showToast,
    currentDay,
    // Custom training data
    customTrainingData,
    updateMuscleDetails,
    updateExercises,
    addExercise,
    deleteExercise,
    settings,
  } = useAppStore();

  // Navigation state
  const [step, setStep] = useState(1); // 1=env, 2=region, 3=muscle, 4=exercises
  const [environment, setEnvironment] = useState(null); // 'gym' | 'home'
  const [bodyRegion, setBodyRegion] = useState(null); // 'upper' | 'lower' | 'core'
  const [muscleGroup, setMuscleGroup] = useState(null); // 'chest' | 'back' | etc.

  // Gym closure state
  const [isGymClosed, setIsGymClosed] = useState(false);
  const [suggestedMode, setSuggestedMode] = useState(null);

  // Check gym closure on mount and when day changes
  useEffect(() => {
    const checkGymClosure = async () => {
      const today = new Date();
      const closed = await isGymClosedDay(today);
      setIsGymClosed(closed);
      if (closed) {
        const mode = await getSuggestedTrainingMode(today);
        setSuggestedMode(mode);
        // Auto-select home environment if gym is closed
        if (!environment) {
          setEnvironment('home');
        }
      }
    };
    checkGymClosure();
  }, [currentDay]);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExercise, setNewExercise] = useState({ name: '', sets: 4, targetReps: 10, equipment: '', formTip: '' });

  // Workout state
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showSkipExerciseModal, setShowSkipExerciseModal] = useState(false);
  const [currentWeight, setCurrentWeight] = useState('');
  const [currentReps, setCurrentReps] = useState('');
  const [currentDistance, setCurrentDistance] = useState('');
  const [currentSpeed, setCurrentSpeed] = useState('');
  const [currentDuration, setCurrentDuration] = useState('');

  // Rest timer countdown
  useEffect(() => {
    if (restTimer > 0) {
      const timer = setTimeout(() => setRestTimer(restTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [restTimer, setRestTimer]);

  // Get current exercise and set
  const currentExerciseIndex = training?.currentExerciseIndex || 0;
  const currentExercise = training?.exercises?.[currentExerciseIndex];
  const completedSets = currentExercise?.completedSets?.length || 0;
  const totalExercises = training?.exercises?.length || 0;

  // Navigation functions
  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setEnvironment(null);
    } else if (step === 3) {
      setStep(2);
      setBodyRegion(null);
    } else if (step === 4) {
      setStep(3);
      setMuscleGroup(null);
    }
  };

  const selectEnvironment = (env) => {
    setEnvironment(env);
    setStep(2);
  };

  const selectBodyRegion = (region) => {
    setBodyRegion(region);
    setStep(3);
  };

  const selectMuscleGroup = (muscle) => {
    setMuscleGroup(muscle);
    setStep(4);
  };

  // Get exercises for current selection (with custom data support)
  const getSelectedExercises = () => {
    if (!environment || !muscleGroup) return [];
    const key = `${environment}_${muscleGroup}`;
    // Check for custom exercises first
    if (customTrainingData.exercises?.[key]) {
      return customTrainingData.exercises[key];
    }
    return getExercisesForMuscle(environment, muscleGroup);
  };

  // Get muscle details (with custom data support)
  const getMuscleDetailsData = () => {
    if (!muscleGroup) return null;
    // Merge custom data with defaults
    const defaults = MUSCLE_DETAILS[muscleGroup] || {};
    const custom = customTrainingData.muscleDetails?.[muscleGroup] || {};
    return {
      muscles: custom.muscles || defaults.muscles || [],
      areas: custom.areas || defaults.areas || [],
      workout: { ...defaults.workout, ...custom.workout },
      howTo: custom.howTo || defaults.howTo || [],
      mistakes: custom.mistakes || defaults.mistakes || [],
      recovery: { ...defaults.recovery, ...custom.recovery },
    };
  };

  // Get muscle group info
  const getSelectedMuscleInfo = () => {
    if (!bodyRegion || !muscleGroup) return null;
    return MUSCLE_GROUPS[bodyRegion]?.find(m => m.id === muscleGroup);
  };

  // Edit handlers
  const startEditing = (field, value) => {
    setEditingField(field);
    setEditValue(Array.isArray(value) ? value.join(', ') : value);
  };

  const saveEdit = (field) => {
    if (!muscleGroup) return;
    const details = getMuscleDetailsData();
    let newValue = editValue;

    // Handle array fields
    if (['areas', 'muscles', 'howTo', 'mistakes'].includes(field.split('.')[0])) {
      const baseField = field.split('.')[0];
      if (field.includes('.')) {
        // Editing specific item in array
        const index = parseInt(field.split('.')[1]);
        const arr = [...details[baseField]];
        arr[index] = editValue;
        newValue = arr;
        field = baseField;
      } else {
        // Converting comma-separated to array
        newValue = editValue.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // Handle nested workout/recovery fields
    if (field.startsWith('workout.')) {
      const subField = field.split('.')[1];
      updateMuscleDetails(muscleGroup, {
        workout: { ...details.workout, [subField]: editValue }
      });
    } else if (field.startsWith('recovery.')) {
      const subField = field.split('.')[1];
      let value = editValue;
      if (subField === 'stretches') {
        value = editValue.split(',').map(s => s.trim()).filter(Boolean);
      }
      updateMuscleDetails(muscleGroup, {
        recovery: { ...details.recovery, [subField]: value }
      });
    } else {
      updateMuscleDetails(muscleGroup, { [field]: newValue });
    }

    setEditingField(null);
    setEditValue('');
    showToast('Saved!', 'success');
  };

  const handleAddListItem = (field) => {
    const details = getMuscleDetailsData();
    const arr = [...(details[field] || []), 'New item'];
    updateMuscleDetails(muscleGroup, { [field]: arr });
  };

  const handleDeleteListItem = (field, index) => {
    const details = getMuscleDetailsData();
    const arr = details[field].filter((_, i) => i !== index);
    updateMuscleDetails(muscleGroup, { [field]: arr });
  };

  const handleAddExercise = () => {
    if (!newExercise.name.trim()) return;
    const key = `${environment}_${muscleGroup}`;
    const currentExercises = customTrainingData.exercises?.[key] || getExercisesForMuscle(environment, muscleGroup);
    updateExercises(environment, muscleGroup, [...currentExercises, {
      ...newExercise,
      restSeconds: 90,
    }]);
    setNewExercise({ name: '', sets: 4, targetReps: 10, equipment: '', formTip: '' });
    setShowAddExercise(false);
    showToast('Exercise added!', 'success');
  };

  const handleDeleteExercise = (index) => {
    const key = `${environment}_${muscleGroup}`;
    const currentExercises = customTrainingData.exercises?.[key] || getExercisesForMuscle(environment, muscleGroup);
    updateExercises(environment, muscleGroup, currentExercises.filter((_, i) => i !== index));
    showToast('Exercise deleted', 'info');
  };

  // Breadcrumb path
  const getBreadcrumb = () => {
    const parts = [];
    if (environment) parts.push(environment === 'gym' ? '🏋️ Gym' : '🏠 Home');
    if (bodyRegion) parts.push(bodyRegion === 'upper' ? '🔼 Upper' : bodyRegion === 'lower' ? '🔽 Lower' : '🔥 Core');
    if (muscleGroup) {
      const info = getSelectedMuscleInfo();
      if (info) parts.push(`${info.icon} ${info.name}`);
    }
    return parts.join(' → ');
  };

  const handleStartWorkout = async () => {
    const exercises = getSelectedExercises().map(e => createExercise(e));
    if (exercises.length === 0) {
      showToast('Please add exercises to start tracking!', 'warning');
      setEditMode(true);
      setShowAddExercise(true);
      return;
    }

    // Pass null as mode for MUSCLE_FOCUSED type, and muscleGroup as focusMuscle
    await startWorkout(TRAINING_TYPE.MUSCLE_FOCUSED, null, exercises, muscleGroup);
    showToast('Workout started! Let\'s go! 💪', 'success');
  };

  const handleLogSet = async () => {
    // Require at least one metric
    if (!currentWeight && !currentReps && !currentDistance && !currentDuration) return;

    await logSet(currentExerciseIndex, {
      weight: parseFloat(currentWeight) || null,
      reps: parseInt(currentReps) || 0,
      distance: parseFloat(currentDistance) || null,
      speed: parseFloat(currentSpeed) || null,
      duration: parseFloat(currentDuration) || null,
    });

    if (completedSets + 1 < currentExercise.sets) {
      setRestTimer(currentExercise.restSeconds);
    }

    // Clear inputs (optional: keep weight if typically constant?)
    // Creating smooth flow by keeping weight, clearing others? Or clear all?
    // User often keeps weight. Let's keep weight, clear reps/others?
    // Actually standard behavior is usually clear or keep all. Let's clear reps/time.
    setCurrentReps('');
    setCurrentDistance('');
    setCurrentSpeed('');
    setCurrentDuration('');
    // Keep weight as it's often constant across sets

    showToast(`Set ${completedSets + 1} logged!`, 'success');
  };

  const handleFinishWorkout = async () => {
    await finishWorkout();
    showToast('Workout complete! Great job! 🎉', 'success');
  };

  const handleSkip = async (reason) => {
    await skipWorkout(reason);
    setShowSkipModal(false);
    showToast('Workout skipped', 'info');
  };

  const handleSkipExercise = async (reason) => {
    const dateStr = training?.date;
    if (!dateStr) return;

    await skipExercise(dateStr, currentExerciseIndex, reason);
    setShowSkipExerciseModal(false);
    showToast(`Exercise skipped: ${currentExercise?.name}`, 'info');
    await useAppStore.getState().refreshDay();
  };

  const handleRestDay = async () => {
    await setRestDay();
    showToast('Today marked as rest day 😌', 'info');
  };

  // ============================================
  // RENDER: Rest Day / Completed / Skipped States
  // ============================================

  if (training?.status === TRAINING_STATUS.REST) {
    return (
      <div className="training-view animate-fade-in">
        <div className="status-card rest">
          <div className="status-icon">😌</div>
          <h2>Rest Day</h2>
          <p className="text-secondary">Recovery is part of the process. Enjoy your day off!</p>
        </div>
        <style>{trainingStyles}</style>
      </div>
    );
  }

  if (training?.status === TRAINING_STATUS.COMPLETED) {
    return (
      <div className="training-view animate-fade-in">
        <div className="status-card completed">
          <div className="status-icon">🎉</div>
          <h2>Workout Complete!</h2>
          <p className="text-secondary">
            Great job! You trained for {training.totalDuration} minutes today.
          </p>
          <div className="summary-stats mt-6">
            <div className="summary-stat">
              <div className="stat-value text-accent">{training.exercises?.length || 0}</div>
              <div className="stat-label">Exercises</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value text-success">
                {training.exercises?.reduce((sum, e) => sum + (e.completedSets?.length || 0), 0) || 0}
              </div>
              <div className="stat-label">Sets</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value">{training.totalDuration || 0}</div>
              <div className="stat-label">Minutes</div>
            </div>
          </div>
        </div>
        <style>{trainingStyles}</style>
      </div>
    );
  }

  if (training?.status === TRAINING_STATUS.SKIPPED) {
    return (
      <div className="training-view animate-fade-in">
        <div className="status-card skipped">
          <div className="status-icon">⏭️</div>
          <h2>Workout Skipped</h2>
          <p className="text-secondary">Reason: {training.skipReason}</p>
          <p className="text-muted mt-4">Tomorrow is a new day. Consistency over perfection.</p>
        </div>
        <style>{trainingStyles}</style>
      </div>
    );
  }

  // ============================================
  // RENDER: Active Workout (In Progress)
  // ============================================

  // Render in-progress UI based on persisted status (not just volatile isTrainingActive flag)
  // This allows resuming workouts after page refresh
  if (training?.status === TRAINING_STATUS.IN_PROGRESS && currentExercise) {
    return (
      <div className="training-view animate-fade-in">
        <div className="workout-progress-header">
          <span className="workout-type badge badge-accent">
            {getSelectedMuscleInfo()?.name || 'Workout'}
          </span>
          <div className="flex items-center gap-2">
            <WorkoutTimer startTime={training.startTime} />
            <span className="exercise-progress text-sm text-secondary">
              {currentExerciseIndex + 1}/{totalExercises}
            </span>
          </div>
        </div>

        <div className="progress-bar mb-6">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentExerciseIndex) / totalExercises) * 100}%` }}
          />
        </div>

        <div className="exercise-card card">
          <h2 className="exercise-name">{currentExercise.name}</h2>
          <p className="last-week text-secondary">
            Target: {currentExercise.sets} sets × {currentExercise.targetReps} reps
          </p>

          <div className="set-indicators">
            {Array.from({ length: currentExercise.sets }).map((_, i) => (
              <div
                key={i}
                className={`set-indicator ${i < completedSets ? 'completed' : i === completedSets ? 'current' : ''}`}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {restTimer > 0 && (
            <div className="rest-timer">
              <div className="rest-timer-label">REST TIME</div>
              <div className="rest-timer-value">
                {Math.floor(restTimer / 60)}:{(restTimer % 60).toString().padStart(2, '0')}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRestTimer(0)}>
                Skip Rest
              </button>
            </div>
          )}

          {restTimer === 0 && completedSets < currentExercise.sets && (
            <div className="set-input">
              <h3 className="set-number">Set {completedSets + 1}</h3>
              <div className="input-row">
                <div className="input-group">
                  <label className="label">Weight (kg)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0"
                    value={currentWeight}
                    onChange={e => setCurrentWeight(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="label">Reps</label>
                  <input
                    type="number"
                    className="input"
                    placeholder={currentExercise.targetReps}
                    value={currentReps}
                    onChange={e => setCurrentReps(e.target.value)}
                  />
                </div>
              </div>
              <div className="input-row-3 mt-2">
                <div className="input-group">
                  <label className="label text-xs">Dist (km)</label>
                  <input
                    type="number"
                    className="input input-sm"
                    placeholder="0"
                    value={currentDistance}
                    onChange={e => setCurrentDistance(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="label text-xs">Speed</label>
                  <input
                    type="number"
                    className="input input-sm"
                    placeholder="0"
                    value={currentSpeed}
                    onChange={e => setCurrentSpeed(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="label text-xs">Time (min)</label>
                  <input
                    type="number"
                    className="input input-sm"
                    placeholder="0"
                    value={currentDuration}
                    onChange={e => setCurrentDuration(e.target.value)}
                  />
                </div>
              </div>

              <button
                className="btn btn-primary w-full mt-4"
                onClick={handleLogSet}
                disabled={!currentWeight && !currentReps && !currentDistance && !currentDuration}
              >
                Complete Set
              </button>
            </div>
          )}

          {currentExercise.completedSets?.length > 0 && (
            <div className="completed-sets mt-4">
              <h4 className="text-sm text-secondary mb-2">Completed Sets</h4>
              <div className="sets-list">
                {currentExercise.completedSets.map((set, i) => (
                  <div key={i} className="set-badge">
                    Set {set.setNumber}: {set.weight}kg × {set.reps}
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentExercise.formTip && (
            <div className="form-tip">
              <span>💡</span>
              <span>{currentExercise.formTip}</span>
            </div>
          )}

          {/* Skip Exercise Button */}
          <button
            className="btn btn-ghost btn-sm mt-4 text-warning"
            onClick={() => setShowSkipExerciseModal(true)}
          >
            ⏭️ Skip This Exercise
          </button>
        </div>

        <div className="workout-nav mt-6">
          {currentExerciseIndex === totalExercises - 1 && completedSets >= currentExercise.sets ? (
            <button className="btn btn-primary btn-lg w-full" onClick={handleFinishWorkout}>
              Finish Workout 🎉
            </button>
          ) : (
            <button className="btn btn-secondary w-full" onClick={() => setShowSkipModal(true)}>
              End Workout
            </button>
          )}
        </div>

        {showSkipModal && (
          <SkipWorkoutModal onClose={() => setShowSkipModal(false)} onSkip={handleSkip} />
        )}

        {showSkipExerciseModal && (
          <SkipExerciseModal
            exerciseName={currentExercise?.name}
            onClose={() => setShowSkipExerciseModal(false)}
            onSkip={handleSkipExercise}
          />
        )}

        <style>{trainingStyles}</style>
      </div>
    );
  }

  // ============================================
  // RENDER: Workout Selection (Hierarchical)
  // ============================================

  return (
    <div className="training-view animate-fade-in">
      <header className="view-header">
        <div className="header-row">
          <div>
            <h1 className="view-title">Training</h1>
            <p className="view-subtitle text-secondary">
              {step === 1 && 'Choose your workout environment'}
              {step === 2 && 'Select body region'}
              {step === 3 && 'Pick a muscle group to train'}
              {step === 4 && 'Review and start your workout'}
            </p>
          </div>
          {step === 1 && (
            <div className="quick-actions-top">
              <button className="btn-compact rest" onClick={handleRestDay}>
                <span className="btn-main">😌 Rest Day</span>
                <span className="btn-subtext">No workout planned</span>
              </button>
              <button className="btn-compact skip" onClick={() => setShowSkipModal(true)}>
                <span className="btn-main">⏭️ Skip Today</span>
                <span className="btn-subtext">Had plans, skipping</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Breadcrumb */}
      {step > 1 && (
        <div className="breadcrumb-container">
          <button className="btn-back" onClick={goBack}>
            ← Back
          </button>
          <span className="breadcrumb-path">{getBreadcrumb()}</span>
        </div>
      )}

      {/* Step 1: Environment Selection */}
      {step === 1 && (
        <section className="selection-section env-section">
          {/* Training Stats Summary */}
          <div className="training-stats-summary">
            <div className="stat-item">
              <span className="stat-value">{currentDay?.workoutsThisWeek || 0}</span>
              <span className="stat-label">This Week</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{training?.averageDuration || '--'}m</span>
              <span className="stat-label">Avg Time</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{settings?.weeklyWorkoutTarget || 4}</span>
              <span className="stat-label">Target</span>
            </div>
          </div>

          {/* Gym Closure Banner */}
          {isGymClosed && (
            <div className="gym-closure-banner">
              <span className="closure-icon">🏠</span>
              <div className="closure-content">
                <strong>Home Workout Day</strong>
                <p>Gym is closed today ({suggestedMode === 'bodyweight' ? 'Bodyweight only' : 'Light cardio recommended'})</p>
              </div>
            </div>
          )}
          <div className="env-buttons-centered">
            <button
              className={`env-btn-large gym ${isGymClosed ? 'disabled' : ''}`}
              onClick={() => !isGymClosed && selectEnvironment('gym')}
              disabled={isGymClosed}
            >
              <span className="env-icon-large">🏋️</span>
              <span className="env-label-large">Gym Workout</span>
              <span className="env-desc">{isGymClosed ? 'Unavailable today' : 'With equipment'}</span>
            </button>
            <button
              className={`env-btn-large home ${isGymClosed ? 'recommended' : ''}`}
              onClick={() => selectEnvironment('home')}
            >
              <span className="env-icon-large">🏠</span>
              <span className="env-label-large">Home Workout</span>
              <span className="env-desc">{isGymClosed ? 'Recommended' : 'No equipment'}</span>
              {isGymClosed && <span className="recommended-badge">Suggested</span>}
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Body Region Selection */}
      {step === 2 && (
        <section className="selection-section">
          <div className="region-buttons">
            <button className="region-btn" onClick={() => selectBodyRegion('upper')}>
              <span className="region-icon">🔼</span>
              <span className="region-label">Upper Body</span>
              <span className="region-desc">Chest, Back, Shoulders, Arms</span>
            </button>
            <button className="region-btn" onClick={() => selectBodyRegion('lower')}>
              <span className="region-icon">🔽</span>
              <span className="region-label">Lower Body</span>
              <span className="region-desc">Quads, Hamstrings, Glutes, Calves</span>
            </button>
            <button className="region-btn" onClick={() => selectBodyRegion('core')}>
              <span className="region-icon">🔥</span>
              <span className="region-label">Core</span>
              <span className="region-desc">Abs, Obliques, Lower Back</span>
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Muscle Group Selection (EDITABLE) */}
      {step === 3 && bodyRegion && (() => {
        // Get muscle groups - check for custom first, then defaults
        const getMuscleGroupsForRegion = () => {
          if (customTrainingData.muscleGroups?.[bodyRegion]) {
            return customTrainingData.muscleGroups[bodyRegion];
          }
          return MUSCLE_GROUPS[bodyRegion] || [];
        };
        const muscles = getMuscleGroupsForRegion();

        return (
          <section className="selection-section">
            {/* Edit Mode Toggle */}
            <div className="edit-mode-toggle">
              <button
                className={`btn-edit-mode ${editMode ? 'active' : ''}`}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? '✓ Done Editing' : '✏️ Edit Mode'}
              </button>
            </div>

            <div className="muscle-grid">
              {muscles.map((muscle, index) => (
                <div key={muscle.id} className={`muscle-btn-wrapper ${editMode ? 'editing' : ''}`}>
                  {editMode && (
                    <button
                      className="btn-delete-muscle"
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = muscles.filter((_, i) => i !== index);
                        const { updateMuscleGroups } = useAppStore.getState();
                        updateMuscleGroups(bodyRegion, updated);
                        showToast('Muscle group deleted', 'info');
                      }}
                    >
                      ×
                    </button>
                  )}
                  <button
                    className="muscle-btn"
                    onClick={() => !editMode && selectMuscleGroup(muscle.id)}
                  >
                    {editMode && editingField === `muscle.${index}.icon` ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          const updated = [...muscles];
                          updated[index] = { ...updated[index], icon: editValue };
                          const { updateMuscleGroups } = useAppStore.getState();
                          updateMuscleGroups(bodyRegion, updated);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const updated = [...muscles];
                            updated[index] = { ...updated[index], icon: editValue };
                            const { updateMuscleGroups } = useAppStore.getState();
                            updateMuscleGroups(bodyRegion, updated);
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        className="inline-input icon-input"
                      />
                    ) : (
                      <span
                        className={`muscle-icon ${editMode ? 'editable-icon' : ''}`}
                        onClick={(e) => {
                          if (editMode) {
                            e.stopPropagation();
                            setEditingField(`muscle.${index}.icon`);
                            setEditValue(muscle.icon);
                          }
                        }}
                      >
                        {muscle.icon}
                      </span>
                    )}

                    {editMode && editingField === `muscle.${index}.name` ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          const updated = [...muscles];
                          updated[index] = { ...updated[index], name: editValue };
                          const { updateMuscleGroups } = useAppStore.getState();
                          updateMuscleGroups(bodyRegion, updated);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const updated = [...muscles];
                            updated[index] = { ...updated[index], name: editValue };
                            const { updateMuscleGroups } = useAppStore.getState();
                            updateMuscleGroups(bodyRegion, updated);
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        className="inline-input"
                      />
                    ) : (
                      <span
                        className={`muscle-label ${editMode ? 'editable-text' : ''}`}
                        onClick={(e) => {
                          if (editMode) {
                            e.stopPropagation();
                            setEditingField(`muscle.${index}.name`);
                            setEditValue(muscle.name);
                          }
                        }}
                      >
                        {muscle.name}
                      </span>
                    )}

                    {editMode && editingField === `muscle.${index}.description` ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          const updated = [...muscles];
                          updated[index] = { ...updated[index], description: editValue };
                          const { updateMuscleGroups } = useAppStore.getState();
                          updateMuscleGroups(bodyRegion, updated);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const updated = [...muscles];
                            updated[index] = { ...updated[index], description: editValue };
                            const { updateMuscleGroups } = useAppStore.getState();
                            updateMuscleGroups(bodyRegion, updated);
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        className="inline-input"
                      />
                    ) : (
                      <span
                        className={`muscle-desc ${editMode ? 'editable-text' : ''}`}
                        onClick={(e) => {
                          if (editMode) {
                            e.stopPropagation();
                            setEditingField(`muscle.${index}.description`);
                            setEditValue(muscle.description);
                          }
                        }}
                      >
                        {muscle.description}
                      </span>
                    )}
                  </button>
                </div>
              ))}

              {/* Add New Muscle Group Button */}
              {editMode && (
                <button
                  className="muscle-btn add-muscle-btn"
                  onClick={() => {
                    const newMuscleId = `custom_${Date.now()}`;
                    const newMuscle = {
                      id: newMuscleId,
                      name: 'New Muscle',
                      icon: '💪',
                      description: 'Custom muscle group'
                    };
                    const updated = [...muscles, newMuscle];
                    const { updateMuscleGroups, updateMuscleDetails } = useAppStore.getState();
                    updateMuscleGroups(bodyRegion, updated);
                    // Create template for new muscle
                    updateMuscleDetails(newMuscleId, {
                      muscles: ['Primary muscle', 'Secondary muscle'],
                      areas: ['Area 1', 'Area 2'],
                      workout: { sets: '3-4', reps: '8-12', tempo: '2 sec down, 1 sec up', rest: '60-90 sec' },
                      howTo: ['Keep proper form', 'Control the movement', 'Full range of motion'],
                      mistakes: ['Rushing reps', 'Using too much weight', 'Poor posture'],
                      recovery: {
                        stretches: ['Stretch 1 – 30 sec', 'Stretch 2 – 30 sec'],
                        restDays: '48-72 hours',
                        tips: 'Rest and recover properly'
                      }
                    });
                    showToast('New muscle group added!', 'success');
                  }}
                >
                  <span className="muscle-icon">➕</span>
                  <span className="muscle-label">Add Muscle Group</span>
                  <span className="muscle-desc">Create custom</span>
                </button>
              )}
            </div>
          </section>
        );
      })()}

      {/* Step 4: Exercise Preview with Detailed Info (EDITABLE) */}
      {step === 4 && muscleGroup && (() => {
        const details = getMuscleDetailsData();
        const exercises = getSelectedExercises();
        const muscleInfo = getSelectedMuscleInfo();

        return (
          <section className="selection-section detail-view">
            {/* Edit Mode Toggle */}
            <div className="edit-mode-toggle">
              <button
                className={`btn-edit-mode ${editMode ? 'active' : ''}`}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? '✓ Done Editing' : '✏️ Edit Mode'}
              </button>
            </div>

            {/* Muscle Header + Start Button */}
            <div className="muscle-header-row">
              <div className="muscle-header">
                <span className="muscle-header-icon">{muscleInfo?.icon}</span>
                <h2 className="muscle-header-name">{muscleInfo?.name}</h2>
              </div>
              <button className="btn btn-primary btn-start-top" onClick={handleStartWorkout}>
                Start Workout 💪
              </button>
            </div>

            {/* Muscle Info Card */}
            {details && (
              <div className="muscle-info-card card">
                {/* Target Areas */}
                <div className="info-section">
                  <h4 className="info-title">
                    🎯 Target Areas
                    {editMode && (
                      <button className="btn-add-sm" onClick={() => handleAddListItem('areas')}>+</button>
                    )}
                  </h4>
                  <div className="tags-row">
                    {details.areas.map((area, i) => (
                      <span key={i} className={`tag ${editMode ? 'editable' : ''}`}>
                        {editMode && editingField === `areas.${i}` ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(`areas.${i}`)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(`areas.${i}`)}
                            autoFocus
                            className="inline-input"
                          />
                        ) : (
                          <span onClick={() => editMode && startEditing(`areas.${i}`, area)}>{area}</span>
                        )}
                        {editMode && (
                          <button className="btn-delete-tag" onClick={() => handleDeleteListItem('areas', i)}>×</button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Muscles Worked */}
                <div className="info-section">
                  <h4 className="info-title">💪 Muscles Worked</h4>
                  {editMode && editingField === 'muscles' ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveEdit('muscles')}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit('muscles')}
                      autoFocus
                      className="inline-input full"
                      placeholder="Comma-separated muscle names"
                    />
                  ) : (
                    <p
                      className={`info-text ${editMode ? 'editable-text' : ''}`}
                      onClick={() => editMode && startEditing('muscles', details.muscles)}
                    >
                      {details.muscles.join(', ')}
                    </p>
                  )}
                </div>

                {/* Workout Prescription */}
                <div className="info-section">
                  <h4 className="info-title">📋 Workout Prescription</h4>
                  <div className="prescription-grid">
                    {['sets', 'reps', 'tempo', 'rest'].map(field => (
                      <div key={field} className="prescription-item">
                        <span className="prescription-label">{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                        {editMode && editingField === `workout.${field}` ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(`workout.${field}`)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(`workout.${field}`)}
                            autoFocus
                            className="inline-input"
                          />
                        ) : (
                          <span
                            className={`prescription-value ${editMode ? 'editable-text' : ''}`}
                            onClick={() => editMode && startEditing(`workout.${field}`, details.workout[field])}
                          >
                            {details.workout[field]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Exercises List */}
            <div className="exercises-section">
              <h3 className="section-label">
                {environment === 'gym' ? '🏋️' : '🏠'} {environment === 'gym' ? 'Gym' : 'Home'} Exercises
                {editMode && (
                  <button className="btn-add" onClick={() => setShowAddExercise(true)}>+ Add Exercise</button>
                )}
              </h3>
              <div className="exercise-list card">
                {exercises.length === 0 && (
                  <div className="empty-state text-center p-6">
                    <p className="text-secondary mb-4">No exercises added yet for this muscle group.</p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setEditMode(true);
                        setShowAddExercise(true);
                      }}
                    >
                      + Add First Exercise
                    </button>
                  </div>
                )}
                {exercises.map((exercise, i) => (
                  <div key={i} className="exercise-preview-item">
                    <span className="exercise-number">{i + 1}</span>
                    <div className="exercise-info">
                      <span className="exercise-name">{exercise.name}</span>
                      {exercise.equipment && (
                        <span className="exercise-equipment">{exercise.equipment}</span>
                      )}
                      {exercise.formTip && (
                        <span className="exercise-tip">💡 {exercise.formTip}</span>
                      )}
                    </div>
                    <span className="exercise-sets">
                      {exercise.sets} × {exercise.targetReps}
                    </span>
                    {editMode && (
                      <button className="btn-delete-item" onClick={() => handleDeleteExercise(i)}>🗑️</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Exercise Form */}
              {showAddExercise && (
                <div className="add-exercise-form card">
                  <h4>Add New Exercise</h4>
                  <div className="form-grid">
                    <input
                      type="text"
                      placeholder="Exercise name"
                      value={newExercise.name}
                      onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })}
                      className="input"
                    />
                    <input
                      type="number"
                      placeholder="Sets"
                      value={newExercise.sets}
                      onChange={(e) => setNewExercise({ ...newExercise, sets: parseInt(e.target.value) || 4 })}
                      className="input"
                    />
                    <input
                      type="number"
                      placeholder="Reps"
                      value={newExercise.targetReps}
                      onChange={(e) => setNewExercise({ ...newExercise, targetReps: parseInt(e.target.value) || 10 })}
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Equipment (optional)"
                      value={newExercise.equipment}
                      onChange={(e) => setNewExercise({ ...newExercise, equipment: e.target.value })}
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Form tip (optional)"
                      value={newExercise.formTip}
                      onChange={(e) => setNewExercise({ ...newExercise, formTip: e.target.value })}
                      className="input full-width"
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-secondary" onClick={() => setShowAddExercise(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleAddExercise}>Add Exercise</button>
                  </div>
                </div>
              )}
            </div>

            {/* How To Section */}
            {details && (
              <div className="info-card card">
                <h4 className="info-title">
                  ✅ How To Do It Right
                  {editMode && (
                    <button className="btn-add-sm" onClick={() => handleAddListItem('howTo')}>+</button>
                  )}
                </h4>
                <ul className="info-list">
                  {details.howTo.map((tip, i) => (
                    <li key={i} className={editMode ? 'editable-item' : ''}>
                      {editMode && editingField === `howTo.${i}` ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(`howTo.${i}`)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(`howTo.${i}`)}
                          autoFocus
                          className="inline-input full"
                        />
                      ) : (
                        <span onClick={() => editMode && startEditing(`howTo.${i}`, tip)}>{tip}</span>
                      )}
                      {editMode && (
                        <button className="btn-delete-inline" onClick={() => handleDeleteListItem('howTo', i)}>×</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Common Mistakes */}
            {details && (
              <div className="info-card card warning">
                <h4 className="info-title">
                  ⚠️ Common Mistakes
                  {editMode && (
                    <button className="btn-add-sm" onClick={() => handleAddListItem('mistakes')}>+</button>
                  )}
                </h4>
                <ul className="info-list">
                  {details.mistakes.map((mistake, i) => (
                    <li key={i} className={editMode ? 'editable-item' : ''}>
                      {editMode && editingField === `mistakes.${i}` ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(`mistakes.${i}`)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(`mistakes.${i}`)}
                          autoFocus
                          className="inline-input full"
                        />
                      ) : (
                        <span onClick={() => editMode && startEditing(`mistakes.${i}`, mistake)}>{mistake}</span>
                      )}
                      {editMode && (
                        <button className="btn-delete-inline" onClick={() => handleDeleteListItem('mistakes', i)}>×</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recovery Info */}
            {details && (
              <div className="info-card card recovery">
                <h4 className="info-title">🧘 Recovery</h4>
                <div className="recovery-content">
                  <div className="recovery-section">
                    <span className="recovery-label">Stretches:</span>
                    {editMode && editingField === 'recovery.stretches' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit('recovery.stretches')}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit('recovery.stretches')}
                        autoFocus
                        className="inline-input full"
                        placeholder="Comma-separated stretches"
                      />
                    ) : (
                      <span
                        className={`recovery-value ${editMode ? 'editable-text' : ''}`}
                        onClick={() => editMode && startEditing('recovery.stretches', details.recovery.stretches)}
                      >
                        {details.recovery.stretches?.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="recovery-section">
                    <span className="recovery-label">Rest Days:</span>
                    {editMode && editingField === 'recovery.restDays' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit('recovery.restDays')}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit('recovery.restDays')}
                        autoFocus
                        className="inline-input full"
                      />
                    ) : (
                      <span
                        className={`recovery-value ${editMode ? 'editable-text' : ''}`}
                        onClick={() => editMode && startEditing('recovery.restDays', details.recovery.restDays)}
                      >
                        {details.recovery.restDays}
                      </span>
                    )}
                  </div>
                  <div className="recovery-section">
                    <span className="recovery-label">Tips:</span>
                    {editMode && editingField === 'recovery.tips' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit('recovery.tips')}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit('recovery.tips')}
                        autoFocus
                        className="inline-input full"
                      />
                    ) : (
                      <span
                        className={`recovery-value ${editMode ? 'editable-text' : ''}`}
                        onClick={() => editMode && startEditing('recovery.tips', details.recovery.tips)}
                      >
                        {details.recovery.tips}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}


          </section>
        );
      })()}

      {showSkipModal && (
        <SkipWorkoutModal onClose={() => setShowSkipModal(false)} onSkip={handleSkip} />
      )}

      <style>{trainingStyles}</style>
    </div>
  );
}

// Skip Workout Modal
function SkipWorkoutModal({ onClose, onSkip }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalReason = reason === 'Custom reason' ? customReason : reason;
    if (!finalReason.trim()) return;
    onSkip(finalReason);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Skip Workout</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-secondary mb-4">
              Please provide a reason. No judgment — just honest tracking.
            </p>
            <div className="reason-options">
              {TRAINING_SKIP_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className={`reason-btn ${reason === r ? 'active' : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Custom reason' && (
              <input
                type="text"
                className="input mt-4"
                placeholder="Enter your reason..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!reason || (reason === 'Custom reason' && !customReason.trim())}
            >
              Skip Workout
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Skip Exercise Modal - For skipping individual exercises with a reason
function SkipExerciseModal({ exerciseName, onClose, onSkip }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const EXERCISE_SKIP_REASONS = [
    'Equipment unavailable',
    'Pain or discomfort',
    'Too fatigued',
    'Running out of time',
    'Already trained today',
    'Custom reason',
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalReason = reason === 'Custom reason' ? customReason : reason;
    if (!finalReason.trim()) return;
    onSkip(finalReason);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Skip Exercise</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-secondary mb-4">
              Skipping <strong>{exerciseName}</strong>. Please select a reason:
            </p>
            <div className="reason-options">
              {EXERCISE_SKIP_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className={`reason-btn ${reason === r ? 'active' : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Custom reason' && (
              <input
                type="text"
                className="input mt-4"
                placeholder="Enter your reason..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-warning"
              disabled={!reason || (reason === 'Custom reason' && !customReason.trim())}
            >
              Skip Exercise
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const trainingStyles = `
  .training-view {
    max-width: 600px;
    margin: 0 auto;
  }

  .view-header {
    margin-bottom: var(--spacing-6);
  }

  .view-title {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
  }

  .view-subtitle {
    margin-top: var(--spacing-1);
  }

  /* Breadcrumb */
  .breadcrumb-container {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    margin-bottom: var(--spacing-6);
    padding: var(--spacing-3) var(--spacing-4);
    background: var(--color-bg-card);
    border-radius: var(--radius-lg);
  }

  .btn-back {
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .btn-back:hover {
    background: var(--color-bg-tertiary);
  }

  .breadcrumb-path {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  /* Selection Section */
  .selection-section {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== HEADER ROW WITH QUICK ACTIONS ===== */
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-4);
  }

  .quick-actions-top {
    display: flex;
    gap: var(--spacing-2);
    flex-shrink: 0;
  }

  /* ===== LARGE CENTERED ENVIRONMENT BUTTONS ===== */
  .env-section {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
  }

  .env-buttons-centered {
    display: flex;
    gap: var(--spacing-6);
    justify-content: center;
    align-items: stretch;
  }

  .env-btn-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-6) var(--spacing-8);
    min-width: 500px;
    min-height: 400px;
    background: var(--color-bg-card);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .env-btn-large:hover {
    border-color: var(--color-accent);
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .env-btn-large.gym:hover {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
    border-color: var(--color-accent);
  }

  .env-btn-large.home:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15));
    border-color: var(--color-success);
  }

  /* Gym Closure Banner */
  .gym-closure-banner {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-4);
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: var(--radius-xl);
    margin-bottom: var(--spacing-6);
  }

  .closure-icon {
    font-size: 2rem;
  }

  .closure-content strong {
    display: block;
    color: var(--color-warning);
    margin-bottom: var(--spacing-1);
  }

  .closure-content p {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  /* Disabled Gym Button */
  .env-btn-large.gym.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--color-border);
  }

  .env-btn-large.gym.disabled:hover {
    transform: none;
    box-shadow: none;
    background: var(--color-bg-card);
    border-color: var(--color-border);
  }

  /* Recommended Home Button */
  .env-btn-large.home.recommended {
    border-color: var(--color-success);
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
    animation: pulse-green 2s infinite;
  }

  .recommended-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background: var(--color-success);
    color: white;
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }

  @keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.2); }
    50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.4); }
  }

  .env-icon-large {
    font-size: 4rem;
    margin-bottom: var(--spacing-4);
  }

  .env-label-large {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-2);
  }

  /* Environment Buttons (legacy) */
  .env-buttons {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-4);
  }

  .env-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-6);
    background: var(--color-bg-card);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .env-btn:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }

  .env-btn.gym:hover {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
  }

  .env-btn.home:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.1));
  }

  .env-icon {
    font-size: 2.5rem;
    margin-bottom: var(--spacing-2);
  }

  .env-label {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .env-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: var(--spacing-1);
  }

  /* Quick Actions */
  .quick-actions {
    display: flex;
    justify-content: center;
    gap: var(--spacing-4);
  }

  .training-stats-summary {
    display: flex;
    justify-content: space-around;
    background: var(--color-bg-tertiary);
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-6);
  }

  .training-stats-summary .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .training-stats-summary .stat-value {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .training-stats-summary .stat-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-compact {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-2) var(--spacing-4);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-main {
    font-weight: var(--font-weight-medium);
  }

  .btn-subtext {
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0.8;
  }

  .btn-compact:hover {
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .btn-compact.rest:hover {
    border-color: var(--color-success);
    color: var(--color-success);
  }

  /* Region Buttons */
  .region-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .region-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-4) var(--spacing-5);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .region-btn:hover {
    border-color: var(--color-accent);
    background: var(--color-bg-card-hover);
  }

  .region-icon {
    font-size: 1.5rem;
  }

  .region-label {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .region-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin-left: auto;
  }

  /* Muscle Grid */
  .muscle-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-3);
  }

  .muscle-btn-wrapper {
    position: relative;
    width: 100%;
  }

  .muscle-btn-wrapper .muscle-btn {
    width: 100%;
  }

  .muscle-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-4);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .muscle-btn:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }

  .muscle-icon {
    font-size: 1.8rem;
    margin-bottom: var(--spacing-2);
  }

  .muscle-label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .muscle-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: var(--spacing-1);
  }

  /* Section Label */
  .section-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--spacing-3);
  }

  /* Exercise List */
  .exercise-list {
    padding: var(--spacing-4);
  }

  .exercise-preview-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .exercise-preview-item:last-child {
    border-bottom: none;
  }

  .exercise-number {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .exercise-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .exercise-name {
    font-weight: var(--font-weight-medium);
  }

  .exercise-equipment {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .exercise-sets {
    font-size: var(--font-size-sm);
    flex-shrink: 0;
  }

  /* Status Cards */
  .status-card {
    text-align: center;
    padding: var(--spacing-12);
  }

  .status-card .status-icon {
    font-size: 4rem;
    margin-bottom: var(--spacing-4);
  }

  .status-card h2 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--spacing-2);
  }

  /* Summary Stats */
  .summary-stats {
    display: flex;
    justify-content: space-around;
    margin-top: var(--spacing-4);
  }

  .summary-stat {
    text-align: center;
  }

  .summary-stat .stat-value {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
  }

  .summary-stat .stat-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Active Workout Styles */
  .workout-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .exercise-progress {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .exercise-card {
    padding: var(--spacing-8);
    text-align: center;
  }

  .exercise-card .exercise-name {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-2);
  }

  .last-week {
    margin-bottom: var(--spacing-6);
  }

  .set-indicators {
    display: flex;
    justify-content: center;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-6);
  }

  .set-indicator {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-full);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-muted);
  }

  .set-indicator.completed {
    background: var(--color-success);
    border-color: var(--color-success);
    color: white;
  }

  .set-indicator.current {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .rest-timer {
    background: var(--color-bg-tertiary);
    padding: var(--spacing-6);
    border-radius: var(--radius-lg);
    margin: var(--spacing-6) 0;
  }

  .rest-timer-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: var(--spacing-2);
  }

  .rest-timer-value {
    font-size: var(--font-size-4xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent);
    margin-bottom: var(--spacing-4);
  }

  .set-input {
    text-align: left;
  }

  .set-number {
    text-align: center;
    color: var(--color-accent);
    margin-bottom: var(--spacing-4);
  }

  .input-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-4);
  }

  .input-row-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--spacing-2);
  }

  .completed-sets .sets-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    justify-content: center;
  }

  .set-badge {
    padding: var(--spacing-1) var(--spacing-3);
    background: var(--color-success-light);
    color: var(--color-success);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
  }

  .form-tip {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-info-light);
    border-radius: var(--radius-md);
    margin-top: var(--spacing-6);
    font-size: var(--font-size-sm);
    color: var(--color-info);
  }

  /* Modal Styles */
  .reason-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
  }

  .reason-btn {
    padding: var(--spacing-2) var(--spacing-4);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .reason-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .reason-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  /* ===== DETAILED MUSCLE VIEW STYLES ===== */
  
  .detail-view {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    padding-right: var(--spacing-2);
  }

  .muscle-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    margin-bottom: var(--spacing-6);
  }

  .muscle-header-icon {
    font-size: 3rem;
  }

  .muscle-header-name {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
  }

  .muscle-info-card {
    padding: var(--spacing-5);
    margin-bottom: var(--spacing-4);
  }

  .info-section {
    margin-bottom: var(--spacing-4);
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .info-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-2);
  }

  .info-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
  }

  .tag {
    padding: var(--spacing-1) var(--spacing-3);
    background: var(--color-accent-light);
    color: var(--color-accent);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .prescription-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-3);
  }

  .prescription-item {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-3);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  .prescription-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-1);
  }

  .prescription-value {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .exercises-section {
    margin-top: var(--spacing-6);
    margin-bottom: var(--spacing-4);
  }

  .exercise-tip {
    font-size: var(--font-size-xs);
    color: var(--color-info);
    margin-top: var(--spacing-1);
  }

  .info-card {
    padding: var(--spacing-4);
    margin-bottom: var(--spacing-4);
  }

  .info-card .info-title {
    margin-bottom: var(--spacing-3);
  }

  .info-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .info-list li {
    position: relative;
    padding-left: var(--spacing-5);
    margin-bottom: var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .info-list li::before {
    content: '•';
    position: absolute;
    left: var(--spacing-2);
    color: var(--color-accent);
  }

  .info-card.warning {
    border-left: 3px solid var(--color-warning);
  }

  .info-card.warning .info-list li::before {
    color: var(--color-warning);
  }

  .info-card.recovery {
    border-left: 3px solid var(--color-success);
  }

  .recovery-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .recovery-section {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
  }

  .recovery-label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    min-width: 80px;
  }

  .recovery-value {
    color: var(--color-text-secondary);
    flex: 1;
  }

  /* ===== WIDER LAYOUT ===== */
  .training-view {
    max-width: 1000px;
    margin: 0 auto;
  }

  .detail-view {
    max-width: 100%;
  }

  /* ===== EDIT MODE STYLES ===== */
  .edit-mode-toggle {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--spacing-4);
  }

  .btn-edit-mode {
    padding: var(--spacing-2) var(--spacing-4);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: all var(--transition-fast);
  }

  .btn-edit-mode:hover {
    background: var(--color-bg-card);
    color: var(--color-text-primary);
  }

  .btn-edit-mode.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  /* Inline Input */
  .inline-input {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: inherit;
    padding: var(--spacing-1) var(--spacing-2);
    outline: none;
    min-width: 60px;
  }

  .inline-input.full {
    width: 100%;
  }

  /* Editable Text */
  .editable-text {
    cursor: pointer;
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .editable-text:hover {
    background: rgba(59, 130, 246, 0.1);
  }

  /* Tags with Edit */
  .tag.editable {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding-right: var(--spacing-1);
  }

  .btn-delete-tag {
    background: none;
    border: none;
    color: var(--color-error);
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: 0 var(--spacing-1);
    opacity: 0.7;
  }

  .btn-delete-tag:hover {
    opacity: 1;
  }

  /* Add Buttons */
  .btn-add-sm {
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-full);
    color: white;
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: var(--spacing-2);
    transition: transform var(--transition-fast);
  }

  .btn-add-sm:hover {
    transform: scale(1.1);
  }

  .btn-add {
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: var(--spacing-1) var(--spacing-3);
    margin-left: var(--spacing-3);
  }

  /* Editable List Items */
  .editable-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .editable-item span {
    flex: 1;
    cursor: pointer;
    padding: var(--spacing-1);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .editable-item span:hover {
    background: rgba(59, 130, 246, 0.1);
  }

  .btn-delete-inline {
    background: none;
    border: none;
    color: var(--color-error);
    cursor: pointer;
    font-size: var(--font-size-lg);
    padding: 0;
    opacity: 0.6;
  }

  .btn-delete-inline:hover {
    opacity: 1;
  }

  /* Delete Exercise Button */
  .btn-delete-item {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-lg);
    opacity: 0.6;
    transition: opacity var(--transition-fast);
  }

  .btn-delete-item:hover {
    opacity: 1;
  }

  .exercise-preview-item {
    position: relative;
  }

  /* Add Exercise Form */
  .add-exercise-form {
    margin-top: var(--spacing-4);
    padding: var(--spacing-4);
  }

  .add-exercise-form h4 {
    margin-bottom: var(--spacing-3);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 80px 80px 1fr;
    gap: var(--spacing-3);
    margin-bottom: var(--spacing-4);
  }

  .form-grid .input {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    padding: var(--spacing-2) var(--spacing-3);
    font-size: var(--font-size-sm);
  }

  .form-grid .input:focus {
    border-color: var(--color-accent);
    outline: none;
  }

  .form-grid .input.full-width {
    grid-column: 1 / -1;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-3);
  }

  /* Info Title with Add Button */
  .info-title {
    display: flex;
    align-items: center;
  }

  .section-label {
    display: flex;
    align-items: center;
  }

  /* ===== MUSCLE HEADER ROW WITH START BUTTON ===== */
  .muscle-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-6);
    gap: var(--spacing-4);
  }

  .btn-start-top {
    padding: var(--spacing-3) var(--spacing-6);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-bold);
    white-space: nowrap;
    background: linear-gradient(135deg, var(--color-success), #059669);
    border: none;
    border-radius: var(--radius-lg);
    color: white;
    cursor: pointer;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-start-top:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
  }

  /* ===== EDITABLE MUSCLE GROUP STYLES ===== */
  .muscle-btn-wrapper.editing .muscle-btn {
    cursor: default;
  }

  .btn-delete-muscle {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    background: var(--color-error);
    border: 2px solid var(--color-bg);
    color: white;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: transform var(--transition-fast);
  }

  .btn-delete-muscle:hover {
    transform: scale(1.1);
  }

  .editable-icon {
    cursor: pointer;
    padding: var(--spacing-1);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .editable-icon:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  .icon-input {
    width: 60px;
    text-align: center;
    font-size: 2rem;
  }

  .add-muscle-btn {
    border: 2px dashed var(--color-accent) !important;
    background: rgba(59, 130, 246, 0.05) !important;
  }

  .add-muscle-btn:hover {
    background: rgba(59, 130, 246, 0.1) !important;
    border-color: var(--color-accent) !important;
  }

  .add-muscle-btn .muscle-icon {
    opacity: 0.8;
  }

  /* ===== MOBILE RESPONSIVE STYLES ===== */
  @media (max-width: 768px) {
    .env-section {
      min-height: auto;
      padding: var(--spacing-4);
    }

    .env-buttons-centered {
      flex-direction: column;
      gap: var(--spacing-4);
    }

    .env-btn-large {
      min-width: auto;
      width: 100%;
      min-height: 200px;
      padding: var(--spacing-4);
    }

    .env-icon-large {
      font-size: 2.5rem;
    }

    .env-label-large {
      font-size: var(--font-size-lg);
    }

    .region-buttons {
      gap: var(--spacing-2);
    }

    .region-btn {
      padding: var(--spacing-3);
    }

    .muscle-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-2);
    }

    .workout-header {
      flex-direction: column;
      gap: var(--spacing-3);
    }

    .workout-actions {
      width: 100%;
      justify-content: space-between;
    }

    .exercise-card .log-form {
      flex-direction: column;
    }
  }

  @media (max-width: 480px) {
    .muscle-grid {
      grid-template-columns: 1fr;
    }

    .env-btn-large {
      min-height: 150px;
    }
  }
`;

// Helper Component: Real-time Workout Timer
function WorkoutTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();
    // Initial set
    setElapsed(Math.floor((Date.now() - start) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <span className="workout-timer badge badge-ghost text-mono font-bold text-lg">
      ⏱️ {formatTime(elapsed)}
    </span>
  );
}
